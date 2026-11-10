#!/usr/bin/env python3
"""Per-process TCP throughput from the kernel's own per-connection counters.

Windows keeps no per-process byte counter an ordinary program can read. What it
does keep, per TCP connection, is TCP Extended Statistics (RFC 4898): once
collection is switched on for a connection the kernel counts the payload bytes
that went out and came in. Summing those over the connections a process owns is
a measurement of that process's TCP traffic, not an estimate.

This is the Windows counterpart of the macOS `nettop` adapter and emits the same
row shape, so the interface treats both the same way.

Three limits, stated rather than hidden:

  * Switching collection on needs administrator rights. Without them
    `available()` says so and nothing is reported.
  * It counts TCP payload only: no UDP (so no QUIC and no video calls that use
    it) and no TCP/IP headers. The figure is what the application sent and
    received, which is lower than what a packet capture at the interface sees.
  * A connection that closes takes its counters with it, so the bytes it moved
    are kept here under the owning process and added back into that process's
    total. A process whose identity cannot be read is reported without a rate
    rather than merged with whatever reuses its PID.
"""
import argparse
import ctypes
import ctypes.wintypes
import json
import signal
import sys
import time

import socket

import connections
import endpoints as endpoint_names
from proc_identity import process_unique_id

DWORD = ctypes.wintypes.DWORD
ULONG = ctypes.c_ulong

# TCP_ESTATS_TYPE. TcpConnectionEstatsSynOpts is 0 and is read-only, so passing
# 0 here fails with ERROR_INVALID_USER_BUFFER rather than enabling anything.
TCP_CONNECTION_ESTATS_DATA = 1

ESTABLISHED = 5
ERROR_ACCESS_DENIED = 5
ERROR_NOT_FOUND = 1168


class MIB_TCPROW(ctypes.Structure):
    _fields_ = [('dwState', DWORD), ('dwLocalAddr', DWORD),
                ('dwLocalPort', DWORD), ('dwRemoteAddr', DWORD),
                ('dwRemotePort', DWORD)]


class MIB_TCP6ROW(ctypes.Structure):
    _fields_ = [('State', DWORD), ('LocalAddr', ctypes.c_ubyte * 16),
                ('dwLocalScopeId', DWORD), ('dwLocalPort', DWORD),
                ('RemoteAddr', ctypes.c_ubyte * 16),
                ('dwRemoteScopeId', DWORD), ('dwRemotePort', DWORD)]


class TCP_ESTATS_DATA_ROD(ctypes.Structure):
    """TCP_ESTATS_DATA_ROD_v0. Only the first four fields are read here; the
    rest are declared so the size matches what the kernel expects."""
    _fields_ = [('DataBytesOut', ctypes.c_ulonglong),
                ('DataSegsOut', ctypes.c_ulonglong),
                ('DataBytesIn', ctypes.c_ulonglong),
                ('DataSegsIn', ctypes.c_ulonglong),
                ('SegsOut', ctypes.c_ulonglong),
                ('SegsIn', ctypes.c_ulonglong),
                ('SoftErrors', DWORD), ('SoftErrorEtype', DWORD),
                ('SndUna', ctypes.c_uint32), ('SndNxt', ctypes.c_uint32),
                ('SndMax', ctypes.c_uint32),
                ('ThruBytesAcked', ctypes.c_ulonglong),
                ('RcvNxt', ctypes.c_uint32),
                ('ThruBytesReceived', ctypes.c_ulonglong)]


_iphlpapi = None


def _library():
    global _iphlpapi
    if _iphlpapi is None:
        _iphlpapi = ctypes.WinDLL('iphlpapi', use_last_error=True)
        for name, row_type in (('SetPerTcpConnectionEStats', MIB_TCPROW),
                               ('SetPerTcp6ConnectionEStats', MIB_TCP6ROW)):
            function = getattr(_iphlpapi, name)
            function.argtypes = [ctypes.POINTER(row_type), ctypes.c_int,
                                 ctypes.POINTER(ctypes.c_ubyte),
                                 ULONG, ULONG, ULONG]
            function.restype = ULONG
        for name, row_type in (('GetPerTcpConnectionEStats', MIB_TCPROW),
                               ('GetPerTcp6ConnectionEStats', MIB_TCP6ROW)):
            function = getattr(_iphlpapi, name)
            function.argtypes = [ctypes.POINTER(row_type), ctypes.c_int,
                                 ctypes.POINTER(ctypes.c_ubyte), ULONG, ULONG,
                                 ctypes.POINTER(ctypes.c_ubyte), ULONG, ULONG,
                                 ctypes.POINTER(ctypes.c_ubyte), ULONG, ULONG]
            function.restype = ULONG
    return _iphlpapi


def _enable(row):
    """Switch byte collection on for one connection. Returns a Windows code."""
    library = _library()
    enable = (ctypes.c_ubyte * 1)(1)  # TCP_ESTATS_DATA_RW_v0.EnableCollection
    setter = (library.SetPerTcp6ConnectionEStats
              if isinstance(row, MIB_TCP6ROW) else library.SetPerTcpConnectionEStats)
    return setter(ctypes.byref(row), TCP_CONNECTION_ESTATS_DATA, enable, 0, 1, 0)


def _read(row):
    """Payload bytes (in, out) for one connection, or None if it is gone."""
    library = _library()
    getter = (library.GetPerTcp6ConnectionEStats
              if isinstance(row, MIB_TCP6ROW) else library.GetPerTcpConnectionEStats)
    rod = TCP_ESTATS_DATA_ROD()
    code = getter(ctypes.byref(row), TCP_CONNECTION_ESTATS_DATA,
                  None, 0, 0, None, 0, 0,
                  ctypes.cast(ctypes.byref(rod), ctypes.POINTER(ctypes.c_ubyte)),
                  0, ctypes.sizeof(rod))
    if code != 0:
        return None  # closed between the table read and now, or not collecting
    return rod.DataBytesIn, rod.DataBytesOut


def _established():
    """(key, row, pid, peer) for every established TCP connection.

    The key identifies the connection across samples. It carries the family so
    an IPv4 and an IPv6 connection can never collide. `peer` is the remote
    address and port as text, which is what the host, service and country
    breakdowns are grouped by.
    """
    for row in connections._table(connections.AF_INET,
                                  connections.MIB_TCPROW_OWNER_PID):
        if row.dwState != ESTABLISHED or row.dwRemoteAddr == 0:
            continue
        key = (4, row.dwLocalAddr, row.dwLocalPort,
               row.dwRemoteAddr, row.dwRemotePort)
        peer = (socket.inet_ntop(socket.AF_INET, row.dwRemoteAddr.to_bytes(4, 'little')),
                connections._port(row.dwRemotePort))
        yield key, MIB_TCPROW(row.dwState, row.dwLocalAddr, row.dwLocalPort,
                              row.dwRemoteAddr, row.dwRemotePort), row.dwOwningPid, peer
    for row in connections._table(connections.AF_INET6,
                                  connections.MIB_TCP6ROW_OWNER_PID):
        local, remote = bytes(row.ucLocalAddr), bytes(row.ucRemoteAddr)
        if row.dwState != ESTABLISHED or remote == bytes(16):
            continue
        key = (6, local, row.dwLocalPort, remote, row.dwRemotePort)
        peer = (socket.inet_ntop(socket.AF_INET6, remote),
                connections._port(row.dwRemotePort))
        yield key, MIB_TCP6ROW(row.dwState, row.ucLocalAddr, row.dwLocalScopeId,
                               row.dwLocalPort, row.ucRemoteAddr,
                               row.dwRemoteScopeId,
                               row.dwRemotePort), row.dwOwningPid, peer


def available():
    """Whether byte collection can be switched on, and why not when it cannot.

    Asking the kernel is the only honest test: the answer depends on the
    process token, not on anything that can be read from configuration.
    """
    if sys.platform != 'win32':
        return False, 'platform', 'TCP EStats only exists on Windows'
    try:
        rows = list(_established())
    except OSError as exc:
        return False, 'table', str(exc)
    if not rows:
        return False, 'idle', 'No established TCP connection to measure yet'
    codes = set()
    for _key, row, _pid, _peer in rows[:8]:
        code = _enable(row)
        if code == 0:
            return True, None, None
        codes.add(code)
    if ERROR_ACCESS_DENIED in codes:
        return False, 'elevation', 'Byte counters need administrator rights'
    return False, 'unsupported', f'TCP EStats refused collection ({sorted(codes)})'


class Collector:
    """Turns the kernel's cumulative counters into per-process rates.

    Each process is keyed by PID and creation time, never by PID alone, so one
    program's bytes are never added to whatever takes its PID later.
    """

    def __init__(self, resolve_names=True):
        self.enabled = set()        # connection keys collection is on for
        self.connections = {}       # connection key -> (owner, bytes_in, bytes_out)
        self.retired = {}           # owner -> [bytes_in, bytes_out] of closed ones
        self.previous = {}          # owner -> (name, bytes_in, bytes_out)
        self.timestamp = None
        self.identities = {}        # pid -> creation time, read once per process
        # The same bytes, grouped by the other end of the connection. This is
        # the one measurement; the host, service, country and LAN/WAN views
        # are four ways of adding it up, not four separate counts.
        self.peers = {}             # connection key -> (peer, bytes_in, bytes_out)
        self.retired_peers = {}     # peer -> [bytes_in, bytes_out]
        self.previous_peers = {}    # peer -> (bytes_in, bytes_out)
        self.peer_sockets = {}      # peer -> number of live connections
        self.names = endpoint_names.Names() if resolve_names else None
        self.countries = endpoint_names.Countries()

    def _identity(self, pid):
        if pid not in self.identities:
            self.identities[pid] = process_unique_id(pid)
        return self.identities[pid]

    def _collect(self):
        """Cumulative bytes by process and by remote endpoint.

        Both come out of the same walk over the connection table, so the two
        views can never disagree about how much moved.
        """
        names = connections.process_names()
        seen = set()
        live = {}
        live_peers = {}
        sockets = {}
        for key, row, pid, peer in _established():
            if key not in self.enabled:
                if _enable(row) != 0:
                    continue
                self.enabled.add(key)
            counters = _read(row)
            if counters is None:
                continue
            owner = (pid, self._identity(pid))
            seen.add(key)
            self.connections[key] = (owner, counters[0], counters[1])
            self.peers[key] = (peer, counters[0], counters[1])
            totals = live.setdefault(owner, [0, 0])
            totals[0] += counters[0]
            totals[1] += counters[1]
            peer_totals = live_peers.setdefault(peer, [0, 0])
            peer_totals[0] += counters[0]
            peer_totals[1] += counters[1]
            sockets[peer] = sockets.get(peer, 0) + 1
        # A connection that is gone keeps its bytes under the process that
        # owned it, so a process's total never falls when a socket closes.
        for key in set(self.connections) - seen:
            owner, incoming, outgoing = self.connections.pop(key)
            self.enabled.discard(key)
            kept = self.retired.setdefault(owner, [0, 0])
            kept[0] += incoming
            kept[1] += outgoing
        for key in set(self.peers) - seen:
            peer, incoming, outgoing = self.peers.pop(key)
            kept = self.retired_peers.setdefault(peer, [0, 0])
            kept[0] += incoming
            kept[1] += outgoing
        result = {}
        for owner in set(live) | set(self.retired):
            incoming, outgoing = live.get(owner, (0, 0))
            kept = self.retired.get(owner, (0, 0))
            pid = owner[0]
            result[owner] = (names.get(pid, f'PID {pid}'),
                             incoming + kept[0], outgoing + kept[1])
        peer_result = {}
        for peer in set(live_peers) | set(self.retired_peers):
            incoming, outgoing = live_peers.get(peer, (0, 0))
            kept = self.retired_peers.get(peer, (0, 0))
            peer_result[peer] = (incoming + kept[0], outgoing + kept[1])
        self.peer_sockets = sockets
        return result, peer_result

    def sample(self):
        """The per-process rows of one measurement."""
        return self.sample_all()['processes']

    def _peer_rows(self, totals, interval):
        """One row per remote endpoint, with everything needed to group it.

        The row carries the facts (address, port, bytes) and the readings made
        from them (scope, service, country, name). The interface groups by
        whichever it is showing; nothing is summed twice.
        """
        rows = []
        for (address, port), (incoming, outgoing) in totals.items():
            old = self.previous_peers.get((address, port))
            received = sent = None
            if old is not None and interval and interval > 0:
                if incoming >= old[0] and outgoing >= old[1]:
                    received = (incoming - old[0]) / interval
                    sent = (outgoing - old[1]) / interval
            rows.append(dict(
                address=address, port=port,
                host=self.names.get(address) if self.names else None,
                scope=endpoint_names.scope_for(address),
                service=endpoint_names.service_for(port),
                country=self.countries.lookup(address),
                sockets=self.peer_sockets.get((address, port), 0),
                bytes_in=incoming, bytes_out=outgoing,
                bytes_in_per_second=received, bytes_out_per_second=sent))
        return rows

    def sample_all(self):
        """One measurement. Rates are None until there are two to difference."""
        timestamp = time.monotonic()
        totals, peer_totals = self._collect()
        interval = None if self.timestamp is None else timestamp - self.timestamp
        peer_rows = self._peer_rows(peer_totals, interval)
        rows = []
        for owner, (name, incoming, outgoing) in totals.items():
            old = self.previous.get(owner)
            state = 'identity_unavailable' if owner[1] is None else 'baseline'
            received = sent = None
            if owner[1] is not None and old is not None and interval and interval > 0:
                if incoming < old[1] or outgoing < old[2]:
                    state = 'counter_reset'
                else:
                    state = 'measured'
                    received = (incoming - old[1]) / interval
                    sent = (outgoing - old[2]) / interval
            # The identity is a string, and is the same string the history
            # writer stores. A process creation time is a FILETIME: past
            # 2**53 it cannot survive a JSON number, and a reader that
            # rounded it would no longer match the same process by key.
            rows.append(dict(pid=owner[0], process=name,
                             process_unique_id=None if owner[1] is None else str(owner[1]),
                             identity=f'{owner[0]}:{owner[1]}',
                             bytes_in=incoming, bytes_out=outgoing,
                             bytes_in_per_second=received, bytes_out_per_second=sent,
                             interval_seconds=interval, state=state))
        # Processes that have gone are forgotten rather than differenced if a
        # later process happens to land on the same PID and creation time.
        self.previous = {owner: values for owner, values in totals.items()}
        self.previous_peers = dict(peer_totals)
        self.timestamp = timestamp
        return {'processes': rows, 'endpoints': peer_rows,
                'interval_seconds': interval}


def stream(samples, interval):
    collector = Collector()
    produced = 0
    while samples == 0 or produced < samples:
        if produced:
            time.sleep(interval)
        measurement = collector.sample_all()
        # The sample number lets a reader group rows without guessing where
        # one measurement ends and the next begins; the kind says which of the
        # two views of that measurement a row belongs to.
        for row in measurement['processes']:
            yield dict(kind='process', protocol='tcp', sample=produced, **row)
        for row in measurement['endpoints']:
            yield dict(kind='endpoint', protocol='tcp', sample=produced, **row)
        produced += 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--samples', type=int, default=10, help='0 = continuous')
    parser.add_argument('--interval', type=float, default=1.0)
    parser.add_argument('--check', action='store_true',
                        help='report whether byte collection can be switched on')
    args = parser.parse_args()
    if args.samples < 0 or args.interval <= 0:
        parser.error('samples must be >= 0 and interval > 0')
    if sys.platform != 'win32':
        parser.error('TCP EStats requires Windows')
    if args.check:
        supported, key, reason = available()
        print(json.dumps(dict(supported=supported, reasonKey=key, reason=reason,
                              countries=endpoint_names.Countries().status())))
        return 0

    def stop_cleanly(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop_cleanly)
    try:
        for row in stream(args.samples, args.interval):
            print(json.dumps(row), flush=True)
    except KeyboardInterrupt:
        return 130
    except OSError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
