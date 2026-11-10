#!/usr/bin/env python3
"""UDP bytes per process, by sniffing packets and joining them to a socket.

This is the third route, and the least sure of the three. It is here because
it was asked for and because it gives something the other two do not: it works
from the packets themselves, so it can be compared against the kernel's own
accounting rather than having to be believed.

How it works. The WinDivert driver that already ships for the DPI engine is
opened in sniff mode, with a filter that matches UDP. Sniff mode is the
important part: the driver hands over a copy and the original packet carries on
regardless of what this process does with it. Being slow here cannot hold up
the machine's traffic, and nothing is modified, dropped or reinjected - the
handle is opened receive-only as well, so this module has no way to send.

What it gives up, and this is not a detail. A packet carries addresses and
ports; it does not carry a process. The owner has to be looked up afterwards,
by asking Windows which process holds the local port - and a socket that has
already closed is no longer in that table. The bytes are real either way, so
they are kept: a datagram whose owner cannot be established is added to an
unattributed total and reported as such. The per-application figures are
therefore a floor rather than the whole, and the interface says so. The ETW
route has no such gap, because the kernel names the process in the event
itself.

The byte count is the UDP payload - the datagram's length without its own
eight byte header and without the IP header - which is the same quantity the
ETW route reports and the same quantity the TCP side reports. The three are
comparable on purpose.
"""
import ctypes
import os
import socket
import struct
import threading
import time

import connections
import endpoints as endpoint_names
from proc_identity import process_unique_id

WINDIVERT_LAYER_NETWORK = 0
WINDIVERT_FLAG_SNIFF = 0x0001
WINDIVERT_FLAG_RECV_ONLY = 0x0004
WINDIVERT_SHUTDOWN_BOTH = 0x3

WINDIVERT_PARAM_QUEUE_LENGTH = 0
WINDIVERT_PARAM_QUEUE_TIME = 1

# Loopback UDP never leaves the machine, so counting it would inflate every
# figure with traffic that did not go anywhere.
FILTER = b'udp and not loopback'
PACKET_BUFFER = 65535 + 40
INVALID_HANDLE = ctypes.c_void_p(-1).value

IPPROTO_UDP = 17
# How often the local-port-to-process table is re-read. Short, because the
# whole accuracy of this route rests on it being fresh.
OWNER_REFRESH_SECONDS = 0.5


class WINDIVERT_ADDRESS(ctypes.Structure):
    """WinDivert 2.x, eighty bytes.

    The flags live in a bitfield that is read here as one word and masked by
    hand: the only two that matter are whether the packet was outbound and
    whether it is IPv6, and a hand mask cannot be laid out wrongly by a
    compiler's idea of bitfield packing.
    """
    _fields_ = [('Timestamp', ctypes.c_int64), ('Flags', ctypes.c_uint32),
                ('Reserved2', ctypes.c_uint32),
                ('Union', ctypes.c_ubyte * 64)]

    OUTBOUND = 1 << 17
    IPV6 = 1 << 20


def _library():
    """WinDivert from the folder it already ships in, by full path.

    The driver WinDivertOpen installs sits beside the DLL, so the DLL has to
    be loaded from that folder rather than found on the search path.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    folder = 'x86_64' if ctypes.sizeof(ctypes.c_void_p) == 8 else 'x86'
    path = os.path.join(here, 'dpi', 'goodbyedpi', folder, 'WinDivert.dll')
    if not os.path.exists(path):
        raise FileNotFoundError(f'WinDivert.dll is not in this build ({path})')
    library = ctypes.WinDLL(path, use_last_error=True)
    # Establish the major version before touching anything else. WinDivert 1.x
    # has no WinDivertShutdown, and it also takes WinDivertRecv's arguments in
    # a different order - calling it with this module's signatures would put
    # the address where the length belongs.
    for export in ('WinDivertShutdown', 'WinDivertHelperCompileFilter'):
        if not hasattr(library, export):
            raise OSError('This WinDivert is older than version 2 '
                          f'(no {export}); it is not used rather than '
                          'called with the wrong arguments')
    library.WinDivertOpen.argtypes = [ctypes.c_char_p, ctypes.c_int,
                                      ctypes.c_int16, ctypes.c_uint64]
    library.WinDivertOpen.restype = ctypes.c_void_p
    # WinDivert 2.x order: the length comes before the address. 1.x had them
    # the other way round, which is why the version is established from the
    # exports before this module is used at all.
    library.WinDivertRecv.argtypes = [ctypes.c_void_p, ctypes.c_void_p,
                                      ctypes.c_uint,
                                      ctypes.POINTER(ctypes.c_uint),
                                      ctypes.POINTER(WINDIVERT_ADDRESS)]
    library.WinDivertRecv.restype = ctypes.c_bool
    library.WinDivertShutdown.argtypes = [ctypes.c_void_p, ctypes.c_uint]
    library.WinDivertShutdown.restype = ctypes.c_bool
    library.WinDivertClose.argtypes = [ctypes.c_void_p]
    library.WinDivertClose.restype = ctypes.c_bool
    library.WinDivertSetParam.argtypes = [ctypes.c_void_p, ctypes.c_int,
                                          ctypes.c_uint64]
    library.WinDivertSetParam.restype = ctypes.c_bool
    return library


def _parse(packet, length, outbound, ipv6):
    """(local address, local port, remote address, remote port, payload) or None.

    Everything is bounds-checked against the length the driver reported. A
    packet that does not parse is not guessed at.
    """
    if ipv6:
        if length < 48:
            return None
        if packet[6] != IPPROTO_UDP:
            return None  # an extension header chain; not followed, not invented
        source = bytes(packet[8:24])
        destination = bytes(packet[24:40])
        udp = 40
        family = socket.AF_INET6
    else:
        if length < 28:
            return None
        if (packet[0] >> 4) != 4:
            return None
        header = (packet[0] & 0x0F) * 4
        if header < 20 or length < header + 8:
            return None
        if packet[9] != IPPROTO_UDP:
            return None
        source = bytes(packet[12:16])
        destination = bytes(packet[16:20])
        udp = header
        family = socket.AF_INET
    source_port, destination_port, udp_length = struct.unpack_from(
        '>HHH', packet, udp)
    if udp_length < 8:
        return None
    payload = min(udp_length - 8, length - udp - 8)
    if payload < 0:
        return None
    if outbound:
        local, local_port = source, source_port
        remote, remote_port = destination, destination_port
    else:
        local, local_port = destination, destination_port
        remote, remote_port = source, source_port
    return (socket.inet_ntop(family, local), local_port,
            socket.inet_ntop(family, remote), remote_port, payload)


class Counter:
    """Running totals of sniffed UDP payload, by process and by endpoint."""

    gives_bytes = True
    gives_peers = True

    def __init__(self):
        self._lock = threading.Lock()
        self._by_pid = {}
        self._by_peer = {}
        self._unattributed = [0, 0]
        self._unparsed = 0
        self._owners = {}
        self._owners_read = 0.0
        self._owner_lock = threading.Lock()
        self.identities = {}
        self.previous = {}
        self.previous_peers = {}
        self.timestamp = None
        self.names = endpoint_names.Names()
        self.countries = endpoint_names.Countries()
        self._library = None
        self._handle = None
        self._thread = None
        self._stop = threading.Event()
        self._error = None
        self._traceback = None
        self._packets = 0

    # -- the driver -------------------------------------------------------
    def start(self):
        self._library = _library()
        handle = self._library.WinDivertOpen(
            FILTER, WINDIVERT_LAYER_NETWORK, 0,
            WINDIVERT_FLAG_SNIFF | WINDIVERT_FLAG_RECV_ONLY)
        if handle is None or handle == INVALID_HANDLE:
            error = ctypes.get_last_error()
            if error == 5:
                raise PermissionError('Opening WinDivert needs administrator rights')
            if error == 577:
                raise OSError('Windows refused the WinDivert driver signature')
            raise OSError(f'WinDivertOpen failed ({error})')
        self._handle = handle
        # A longer queue costs memory and buys tolerance of a burst. Nothing is
        # lost from the machine's traffic if the queue overflows, because this
        # is a sniff: only our own count would miss those packets.
        self._library.WinDivertSetParam(handle, WINDIVERT_PARAM_QUEUE_LENGTH, 8192)
        self._library.WinDivertSetParam(handle, WINDIVERT_PARAM_QUEUE_TIME, 2000)
        self._thread = threading.Thread(target=self._pump, daemon=True,
                                        name='wirecove-windivert')
        self._thread.start()
        return self

    def _owner_for(self, address, port):
        """Which process holds this local endpoint, if the table still says.

        Keyed by address and port, not by port alone: two processes can hold
        the same port number on different addresses, and joining on the number
        by itself puts one program's bytes under the other. The packet carries
        the local address, so it is used.

        A socket bound to the wildcard address is listed as 0.0.0.0 or :: while
        its packets carry the address of the interface they went out of, so the
        exact match is tried first and the wildcard second. A port in neither
        belongs to a socket that has already closed, and no guess is made.
        """
        now = time.monotonic()
        with self._owner_lock:
            if now - self._owners_read > OWNER_REFRESH_SECONDS:
                try:
                    table = {}
                    for pid, _family, local, local_port in connections.udp_sockets():
                        table.setdefault((local, local_port), pid)
                    self._owners = table
                    self._owners_read = now
                except OSError:
                    self._owners_read = now
            owner = self._owners.get((address, port))
            if owner is not None:
                return owner
            wildcard = '::' if ':' in address else '0.0.0.0'
            return self._owners.get((wildcard, port))

    def _pump(self):
        try:
            self._read_packets()
        except BaseException as exc:  # noqa: BLE001
            # A reader thread that has died must not look like a quiet network.
            # The reason is kept and reported, and the interface says the mode
            # stopped rather than showing a zero that means nothing.
            import traceback
            self._error = f'{exc.__class__.__name__}: {exc}'
            self._traceback = traceback.format_exc()

    def _read_packets(self):
        packet = (ctypes.c_ubyte * PACKET_BUFFER)()
        # A memoryview of a ctypes array carries ctypes' own format string, and
        # indexing one byte of it raises rather than returning a number. Cast
        # to plain unsigned bytes once, here, so the parser can read it without
        # copying every packet.
        view = memoryview(packet).cast('B')
        address = WINDIVERT_ADDRESS()
        read = ctypes.c_uint(0)
        while not self._stop.is_set():
            ok = self._library.WinDivertRecv(self._handle, packet, PACKET_BUFFER,
                                             ctypes.byref(read),
                                             ctypes.byref(address))
            if not ok:
                if self._stop.is_set():
                    return
                # ERROR_NO_DATA after a shutdown, or a transient failure. A
                # sniff that cannot read is worth stopping rather than spinning.
                if ctypes.get_last_error() in (232, 995):
                    return
                time.sleep(0.05)
                continue
            with self._lock:
                self._packets += 1
            parsed = _parse(view[:read.value], read.value,
                            bool(address.Flags & WINDIVERT_ADDRESS.OUTBOUND),
                            bool(address.Flags & WINDIVERT_ADDRESS.IPV6))
            if parsed is None:
                with self._lock:
                    self._unparsed += 1
                continue
            local, local_port, remote, remote_port, payload = parsed
            if payload == 0:
                continue
            index = 1 if (address.Flags & WINDIVERT_ADDRESS.OUTBOUND) else 0
            pid = self._owner_for(local, local_port)
            with self._lock:
                if pid is None:
                    self._unattributed[index] += payload
                else:
                    totals = self._by_pid.setdefault(pid, [0, 0])
                    totals[index] += payload
                peer = self._by_peer.setdefault((remote, remote_port), [0, 0])
                peer[index] += payload

    # -- reading it out ---------------------------------------------------
    def _identity(self, pid):
        if pid not in self.identities:
            self.identities[pid] = process_unique_id(pid)
        return self.identities[pid]

    def sample_all(self):
        timestamp = time.monotonic()
        with self._lock:
            owners = {pid: list(values) for pid, values in self._by_pid.items()}
            peers = {key: list(values) for key, values in self._by_peer.items()}
            unattributed = list(self._unattributed)
            unparsed = self._unparsed
            packets = self._packets
        interval = None if self.timestamp is None else timestamp - self.timestamp
        names = connections.process_names()
        rows = []
        for pid, (incoming, outgoing) in owners.items():
            old = self.previous.get(pid)
            received = sent = None
            state = 'baseline'
            if old is not None and interval and interval > 0:
                state = 'measured'
                received = max(0.0, (incoming - old[0]) / interval)
                sent = max(0.0, (outgoing - old[1]) / interval)
            rows.append(dict(
                pid=pid, process=names.get(pid, f'PID {pid}'),
                process_unique_id=(None if self._identity(pid) is None
                                   else str(self._identity(pid))),
                identity=f'{pid}:{self._identity(pid)}',
                bytes_in=incoming, bytes_out=outgoing,
                bytes_in_per_second=received, bytes_out_per_second=sent,
                interval_seconds=interval, state=state))
        peer_rows = []
        for (address, port), (incoming, outgoing) in peers.items():
            old = self.previous_peers.get((address, port))
            received = sent = None
            if old is not None and interval and interval > 0:
                received = max(0.0, (incoming - old[0]) / interval)
                sent = max(0.0, (outgoing - old[1]) / interval)
            peer_rows.append(dict(
                address=address, port=port, host=self.names.get(address),
                scope=endpoint_names.scope_for(address),
                service=endpoint_names.service_for(port),
                country=self.countries.lookup(address), sockets=0,
                bytes_in=incoming, bytes_out=outgoing,
                bytes_in_per_second=received, bytes_out_per_second=sent))
        self.previous = owners
        self.previous_peers = peers
        self.timestamp = timestamp
        return {'processes': rows, 'endpoints': peer_rows,
                'interval_seconds': interval,
                # Bytes that are real but whose owner had already gone. Shown
                # rather than dropped, so the per-application rows can be read
                # as the floor they are.
                'unattributed_in': unattributed[0],
                'unattributed_out': unattributed[1],
                'unparsed_packets': unparsed,
                'packets': packets, 'error': self._error}

    def close(self):
        self._stop.set()
        if self._handle and self._library is not None:
            try:
                self._library.WinDivertShutdown(self._handle,
                                                WINDIVERT_SHUTDOWN_BOTH)
            except OSError:
                pass
            try:
                self._library.WinDivertClose(self._handle)
            except OSError:
                pass
            self._handle = None
        if self._thread is not None:
            self._thread.join(timeout=5)


def build():
    """A started counter, or a reason this machine will not give one."""
    counter = Counter()
    try:
        counter.start()
    except PermissionError as exc:
        counter.close()
        return None, ('elevation', str(exc))
    except FileNotFoundError as exc:
        counter.close()
        return None, ('missing', str(exc))
    except OSError as exc:
        counter.close()
        return None, ('refused', str(exc))
    return counter, None
