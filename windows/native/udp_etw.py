#!/usr/bin/env python3
"""UDP bytes per process, from Windows' own event stream.

The kernel announces every datagram it sends or receives on the
Microsoft-Windows-Kernel-Network provider, and the announcement carries the
owning process id, the byte count and both endpoints. Adding those up is a
measurement of UDP traffic in the same sense that the TCP side is a
measurement: the numbers come from the kernel's own accounting, not from a
sample or a guess.

Why this route rather than a packet capture: it asks Windows what happened
instead of standing in the way of it happening. Nothing is intercepted, no
driver of ours is in the packet path, and the process id arrives with the
event instead of having to be joined back through a port that may already have
been reused.

What it costs: a trace session needs administrator rights, and there is one
event per datagram. A busy video call is thousands a second, so the events are
folded into running totals on a worker thread and the totals are only read out
once per interval. ProcessTrace blocks until the session stops, which is why
it has a thread to itself.

Three things are deliberately not done here. The payload is read at fixed
offsets rather than through TDH, because the layout of these four events is
simple and stable and pulling in the trace-decoding library to read two
integers would be the larger risk; every read is still bounds-checked against
the event's own length, and a payload that is shorter than it should be is
dropped rather than parsed. Nothing is written: the session is real-time only
and never touches a file. And the trace is stopped on the way out, including
after a crash, because a session left running keeps costing the machine.
"""
import ctypes
import ctypes.wintypes
import socket
import struct
import threading

from proc_identity import process_unique_id
import connections
import endpoints as endpoint_names

ULONG = ctypes.wintypes.ULONG
USHORT = ctypes.wintypes.USHORT
UCHAR = ctypes.c_ubyte
ULONG64 = ctypes.c_ulonglong
LONG = ctypes.wintypes.LONG
TRACEHANDLE = ctypes.c_ulonglong
INVALID_TRACEHANDLE = ctypes.c_ulonglong(0xFFFFFFFFFFFFFFFF).value

SESSION_NAME = 'Wirecove-UDP'

# Microsoft-Windows-Kernel-Network.
PROVIDER_GUID_TEXT = '{7DD42A49-5329-4832-8DFD-43D979153A88}'

EVENT_TRACE_REAL_TIME_MODE = 0x00000100
PROCESS_TRACE_MODE_REAL_TIME = 0x00000100
PROCESS_TRACE_MODE_EVENT_RECORD = 0x10000000
WNODE_FLAG_TRACED_GUID = 0x00020000
EVENT_CONTROL_CODE_ENABLE_PROVIDER = 1
EVENT_TRACE_CONTROL_STOP = 1
TRACE_LEVEL_VERBOSE = 5
EVENT_FILTER_TYPE_EVENT_ID = 0x80000200
ENABLE_TRACE_PARAMETERS_VERSION_2 = 2

ERROR_SUCCESS = 0
ERROR_ALREADY_EXISTS = 183
ERROR_ACCESS_DENIED = 5
ERROR_CANCELLED = 1223
ERROR_WMI_INSTANCE_NOT_FOUND = 4201

# The four events that carry a UDP datagram. The other events on this provider
# are TCP, which the EStats collector already measures exactly; counting them
# here as well would double them.
UDP_SENT_V4, UDP_RECV_V4 = 42, 43
UDP_SENT_V6, UDP_RECV_V6 = 58, 59
UDP_EVENTS = {UDP_SENT_V4: (4, 'out'), UDP_RECV_V4: (4, 'in'),
              UDP_SENT_V6: (6, 'out'), UDP_RECV_V6: (6, 'in')}

# EventData for these events, in order: pid, size, daddr, saddr, dport, sport,
# then fields this module does not read. The address width is the only
# difference between the IPv4 and IPv6 forms.
LAYOUT = {4: struct.Struct('<IIIIHH'), 6: struct.Struct('<II16s16sHH')}


class GUID(ctypes.Structure):
    _fields_ = [('Data1', ctypes.c_ulong), ('Data2', ctypes.c_ushort),
                ('Data3', ctypes.c_ushort), ('Data4', UCHAR * 8)]


def _guid(text):
    guid = GUID()
    ole32 = ctypes.WinDLL('ole32', use_last_error=True)
    if ole32.CLSIDFromString(ctypes.c_wchar_p(text), ctypes.byref(guid)) != 0:
        raise OSError(f'Unreadable provider GUID {text}')
    return guid


class WNODE_HEADER(ctypes.Structure):
    _fields_ = [('BufferSize', ULONG), ('ProviderId', ULONG),
                ('HistoricalContext', ULONG64), ('TimeStamp', ctypes.c_longlong),
                ('Guid', GUID), ('ClientContext', ULONG), ('Flags', ULONG)]


class EVENT_TRACE_PROPERTIES(ctypes.Structure):
    _fields_ = [('Wnode', WNODE_HEADER), ('BufferSize', ULONG),
                ('MinimumBuffers', ULONG), ('MaximumBuffers', ULONG),
                ('MaximumFileSize', ULONG), ('LogFileMode', ULONG),
                ('FlushTimer', ULONG), ('EnableFlags', ULONG),
                ('AgeLimit', LONG), ('NumberOfBuffers', ULONG),
                ('FreeBuffers', ULONG), ('EventsLost', ULONG),
                ('BuffersWritten', ULONG), ('LogBuffersLost', ULONG),
                ('RealTimeBuffersLost', ULONG), ('LoggerThreadId', ctypes.c_void_p),
                ('LogFileNameOffset', ULONG), ('LoggerNameOffset', ULONG)]


class EVENT_TRACE_HEADER(ctypes.Structure):
    _fields_ = [('Size', USHORT), ('FieldTypeFlags', USHORT),
                ('Version', ULONG), ('ThreadId', ULONG), ('ProcessId', ULONG),
                ('TimeStamp', ctypes.c_longlong), ('Guid', GUID),
                ('ClientContext', ULONG), ('Flags', ULONG)]


class ETW_BUFFER_CONTEXT(ctypes.Structure):
    _fields_ = [('ProcessorNumber', UCHAR), ('Alignment', UCHAR),
                ('LoggerId', USHORT)]


class EVENT_TRACE(ctypes.Structure):
    _fields_ = [('Header', EVENT_TRACE_HEADER), ('InstanceId', ULONG),
                ('ParentInstanceId', ULONG), ('ParentGuid', GUID),
                ('MofData', ctypes.c_void_p), ('MofLength', ULONG),
                ('BufferContext', ETW_BUFFER_CONTEXT)]


class SYSTEMTIME(ctypes.Structure):
    _fields_ = [(name, USHORT) for name in
                ('wYear', 'wMonth', 'wDayOfWeek', 'wDay', 'wHour', 'wMinute',
                 'wSecond', 'wMilliseconds')]


class TIME_ZONE_INFORMATION(ctypes.Structure):
    _fields_ = [('Bias', LONG), ('StandardName', ctypes.c_wchar * 32),
                ('StandardDate', SYSTEMTIME), ('StandardBias', LONG),
                ('DaylightName', ctypes.c_wchar * 32),
                ('DaylightDate', SYSTEMTIME), ('DaylightBias', LONG)]


class TRACE_LOGFILE_HEADER(ctypes.Structure):
    _fields_ = [('BufferSize', ULONG), ('Version', ULONG),
                ('ProviderVersion', ULONG), ('NumberOfProcessors', ULONG),
                ('EndTime', ctypes.c_longlong), ('TimerResolution', ULONG),
                ('MaximumFileSize', ULONG), ('LogFileMode', ULONG),
                ('BuffersWritten', ULONG), ('LogInstanceGuid', GUID),
                ('LoggerName', ctypes.c_void_p), ('LogFileName', ctypes.c_void_p),
                ('TimeZone', TIME_ZONE_INFORMATION),
                ('BootTime', ctypes.c_longlong), ('PerfFreq', ctypes.c_longlong),
                ('StartTime', ctypes.c_longlong), ('ReservedFlags', ULONG),
                ('BuffersLost', ULONG)]


class EVENT_DESCRIPTOR(ctypes.Structure):
    _fields_ = [('Id', USHORT), ('Version', UCHAR), ('Channel', UCHAR),
                ('Level', UCHAR), ('Opcode', UCHAR), ('Task', USHORT),
                ('Keyword', ULONG64)]


class EVENT_HEADER(ctypes.Structure):
    _fields_ = [('Size', USHORT), ('HeaderType', USHORT), ('Flags', USHORT),
                ('EventProperty', USHORT), ('ThreadId', ULONG),
                ('ProcessId', ULONG), ('TimeStamp', ctypes.c_longlong),
                ('ProviderId', GUID), ('EventDescriptor', EVENT_DESCRIPTOR),
                ('ProcessorTime', ULONG64), ('ActivityId', GUID)]


class EVENT_RECORD(ctypes.Structure):
    _fields_ = [('EventHeader', EVENT_HEADER),
                ('BufferContext', ETW_BUFFER_CONTEXT),
                ('ExtendedDataCount', USHORT), ('UserDataLength', USHORT),
                ('ExtendedData', ctypes.c_void_p),
                ('UserData', ctypes.c_void_p), ('UserContext', ctypes.c_void_p)]


EVENT_RECORD_CALLBACK = ctypes.WINFUNCTYPE(None, ctypes.POINTER(EVENT_RECORD))
BUFFER_CALLBACK = ctypes.WINFUNCTYPE(ULONG, ctypes.c_void_p)


class EVENT_TRACE_LOGFILEW(ctypes.Structure):
    _fields_ = [('LogFileName', ctypes.c_wchar_p),
                ('LoggerName', ctypes.c_wchar_p),
                ('CurrentTime', ctypes.c_longlong), ('BuffersRead', ULONG),
                ('ProcessTraceMode', ULONG), ('CurrentEvent', EVENT_TRACE),
                ('LogfileHeader', TRACE_LOGFILE_HEADER),
                ('BufferCallback', BUFFER_CALLBACK), ('BufferSize', ULONG),
                ('Filled', ULONG), ('EventsLost', ULONG),
                ('EventRecordCallback', EVENT_RECORD_CALLBACK),
                ('IsKernelTrace', ULONG), ('Context', ctypes.c_void_p)]


class EVENT_FILTER_DESCRIPTOR(ctypes.Structure):
    _fields_ = [('Ptr', ULONG64), ('Size', ULONG), ('Type', ULONG)]


class ENABLE_TRACE_PARAMETERS(ctypes.Structure):
    _fields_ = [('Version', ULONG), ('EnableProperty', ULONG),
                ('ControlFlags', ULONG), ('SourceId', GUID),
                ('EnableFilterDesc', ctypes.c_void_p),
                ('FilterDescCount', ULONG)]


def _advapi32():
    library = ctypes.WinDLL('advapi32', use_last_error=True)
    library.StartTraceW.argtypes = [ctypes.POINTER(TRACEHANDLE), ctypes.c_wchar_p,
                                    ctypes.POINTER(EVENT_TRACE_PROPERTIES)]
    library.StartTraceW.restype = ULONG
    library.ControlTraceW.argtypes = [TRACEHANDLE, ctypes.c_wchar_p,
                                      ctypes.POINTER(EVENT_TRACE_PROPERTIES), ULONG]
    library.ControlTraceW.restype = ULONG
    library.EnableTraceEx2.argtypes = [TRACEHANDLE, ctypes.POINTER(GUID), ULONG,
                                       UCHAR, ULONG64, ULONG64, ULONG,
                                       ctypes.POINTER(ENABLE_TRACE_PARAMETERS)]
    library.EnableTraceEx2.restype = ULONG
    library.OpenTraceW.argtypes = [ctypes.POINTER(EVENT_TRACE_LOGFILEW)]
    library.OpenTraceW.restype = TRACEHANDLE
    library.ProcessTrace.argtypes = [ctypes.POINTER(TRACEHANDLE), ULONG,
                                     ctypes.c_void_p, ctypes.c_void_p]
    library.ProcessTrace.restype = ULONG
    library.CloseTrace.argtypes = [TRACEHANDLE]
    library.CloseTrace.restype = ULONG
    return library


def _event_id_filter(event_ids):
    """An EVENT_FILTER_EVENT_ID holding the ids we want and nothing else.

    The structure ends in a variable length array, so it is built as one
    allocation with the ids written after the fixed part.
    """
    count = len(event_ids)

    class EVENT_FILTER_EVENT_ID(ctypes.Structure):
        _fields_ = [('FilterIn', UCHAR), ('Reserved', UCHAR),
                    ('Count', USHORT), ('Events', USHORT * count)]

    body = EVENT_FILTER_EVENT_ID()
    body.FilterIn = 1  # these ids, rather than all but these ids
    body.Count = count
    for index, event_id in enumerate(event_ids):
        body.Events[index] = event_id
    return body


def _properties():
    """One EVENT_TRACE_PROPERTIES with room for the session name after it.

    The name is not a pointer: the structure and the string it points into have
    to be one allocation, with the name's offset recorded in the structure.
    """
    name = SESSION_NAME + '\0'
    size = ctypes.sizeof(EVENT_TRACE_PROPERTIES) + len(name) * 2
    buffer = (ctypes.c_byte * size)()
    properties = ctypes.cast(buffer,
                             ctypes.POINTER(EVENT_TRACE_PROPERTIES)).contents
    properties.Wnode.BufferSize = size
    properties.Wnode.Flags = WNODE_FLAG_TRACED_GUID
    properties.Wnode.ClientContext = 1  # QueryPerformanceCounter timestamps
    properties.LogFileMode = EVENT_TRACE_REAL_TIME_MODE
    properties.BufferSize = 64         # KB per buffer
    properties.MinimumBuffers = 8
    properties.MaximumBuffers = 32
    properties.FlushTimer = 1          # seconds, so a quiet machine still reports
    properties.LoggerNameOffset = ctypes.sizeof(EVENT_TRACE_PROPERTIES)
    ctypes.memmove(ctypes.addressof(buffer) + properties.LoggerNameOffset,
                   ctypes.create_unicode_buffer(name), len(name) * 2)
    return buffer, properties


class Counter:
    """A running total of UDP bytes per process and per remote endpoint.

    The totals are cumulative for the life of this collector, and the rates are
    differences between two reads of them, which is the same shape the TCP side
    produces. Cumulative rather than per-interval so a reader that misses a
    sample loses the rate for that moment but never the bytes.
    """

    gives_bytes = True
    gives_peers = True

    def __init__(self):
        self._lock = threading.Lock()
        self._by_owner = {}      # pid -> [bytes in, bytes out]
        self._by_peer = {}       # (address, port) -> [bytes in, bytes out]
        self._dropped = 0        # events too short to trust, counted not guessed
        self._keywords = 0       # the keyword bits the UDP events arrived under
        self._lost = 0
        self.identities = {}
        self.previous = {}
        self.previous_peers = {}
        self.timestamp = None
        self.names = endpoint_names.Names()
        self.countries = endpoint_names.Countries()
        self._handle = TRACEHANDLE(0)
        self._trace = TRACEHANDLE(INVALID_TRACEHANDLE)
        self._library = _advapi32()
        self._buffer = None
        self._thread = None
        self._closed = False
        self.filtered = False
        # The callback is kept on the instance: if it were a local it could be
        # collected while the kernel still holds the pointer.
        self._callback = EVENT_RECORD_CALLBACK(self._on_event)
        self._buffer_callback = BUFFER_CALLBACK(lambda _context: 1)

    # -- the trace session ------------------------------------------------
    def start(self):
        library = self._library
        self._buffer, properties = _properties()
        code = library.StartTraceW(ctypes.byref(self._handle), SESSION_NAME,
                                   ctypes.byref(properties))
        if code == ERROR_ALREADY_EXISTS:
            # Ours from a previous run that did not get to stop it. Stopping a
            # session we did not open is safe: the name is this application's.
            stop_buffer, stop_properties = _properties()
            library.ControlTraceW(0, SESSION_NAME, ctypes.byref(stop_properties),
                                  EVENT_TRACE_CONTROL_STOP)
            del stop_buffer
            self._buffer, properties = _properties()
            code = library.StartTraceW(ctypes.byref(self._handle), SESSION_NAME,
                                       ctypes.byref(properties))
        if code == ERROR_ACCESS_DENIED:
            raise PermissionError('A trace session needs administrator rights')
        if code != ERROR_SUCCESS:
            raise OSError(f'StartTrace failed ({code})')

        guid = _guid(PROVIDER_GUID_TEXT)
        # Every keyword, because this provider's keywords select the address
        # family rather than the protocol: there is no bit that means "UDP
        # only", and asking for a guessed bit can miss datagrams.
        #
        # The narrowing happens with an event id filter instead, which the
        # kernel applies before the event is ever handed over. Without it this
        # session would also carry one event per TCP segment - thousands a
        # second on a fast download, all of them discarded on arrival. The
        # filter is what makes this affordable to leave running.
        self._filter_buffer = _event_id_filter(sorted(UDP_EVENTS))
        descriptor = EVENT_FILTER_DESCRIPTOR(
            Ptr=ctypes.addressof(self._filter_buffer),
            Size=ctypes.sizeof(self._filter_buffer),
            Type=EVENT_FILTER_TYPE_EVENT_ID)
        self._filter_descriptor = descriptor
        parameters = ENABLE_TRACE_PARAMETERS(
            Version=ENABLE_TRACE_PARAMETERS_VERSION_2,
            EnableFilterDesc=ctypes.cast(ctypes.byref(descriptor),
                                         ctypes.c_void_p),
            FilterDescCount=1)
        code = library.EnableTraceEx2(
            self._handle, ctypes.byref(guid),
            EVENT_CONTROL_CODE_ENABLE_PROVIDER, TRACE_LEVEL_VERBOSE,
            0xFFFFFFFFFFFFFFFF, 0, 0, ctypes.byref(parameters))
        if code != ERROR_SUCCESS:
            # An older Windows may refuse the filter rather than the provider.
            # Falling back to no filter keeps the measurement correct and only
            # costs the discarded TCP events, so it is worth doing - but it is
            # a fallback, not the plan.
            code = library.EnableTraceEx2(
                self._handle, ctypes.byref(guid),
                EVENT_CONTROL_CODE_ENABLE_PROVIDER, TRACE_LEVEL_VERBOSE,
                0xFFFFFFFFFFFFFFFF, 0, 0, None)
            self.filtered = code != ERROR_SUCCESS
        else:
            self.filtered = True
        if code != ERROR_SUCCESS:
            self.close()
            raise OSError(f'EnableTraceEx2 failed ({code})')

        logfile = EVENT_TRACE_LOGFILEW()
        logfile.LoggerName = SESSION_NAME
        logfile.ProcessTraceMode = (PROCESS_TRACE_MODE_REAL_TIME
                                    | PROCESS_TRACE_MODE_EVENT_RECORD)
        logfile.EventRecordCallback = self._callback
        logfile.BufferCallback = self._buffer_callback
        self._logfile = logfile
        self._trace = TRACEHANDLE(library.OpenTraceW(ctypes.byref(logfile)))
        if self._trace.value == INVALID_TRACEHANDLE:
            error = ctypes.get_last_error()
            self.close()
            raise OSError(f'OpenTrace failed ({error})')

        self._thread = threading.Thread(target=self._pump, daemon=True,
                                        name='wirecove-etw')
        self._thread.start()
        return self

    def _pump(self):
        """ProcessTrace blocks until the session stops, so it owns a thread."""
        handles = (TRACEHANDLE * 1)(self._trace.value)
        try:
            self._library.ProcessTrace(handles, 1, None, None)
        except OSError:
            pass

    # -- the callback -----------------------------------------------------
    def _on_event(self, record_pointer):
        """Called by the kernel's thread for every event. Does as little as
        possible: a bounds check, an unpack, and two additions."""
        try:
            record = record_pointer.contents
            event_id = record.EventHeader.EventDescriptor.Id
            shape = UDP_EVENTS.get(event_id)
            if shape is None:
                return
            family, direction = shape
            layout = LAYOUT[family]
            length = record.UserDataLength
            if length < layout.size or not record.UserData:
                # Short payload: the layout is not what this build emits.
                # Counted so the interface can say so, never half-parsed.
                with self._lock:
                    self._dropped += 1
                return
            payload = ctypes.string_at(record.UserData, layout.size)
            pid, size, daddr, saddr, dport, sport = layout.unpack(payload)
            # The ports arrive in network byte order, the way they sit on the
            # wire. Read as little-endian integers they come out byte-swapped:
            # 53 reads as 13568 and 443 as 47873, which would put every
            # datagram under the wrong service and the wrong port.
            dport, sport = socket.ntohs(dport), socket.ntohs(sport)
            if size <= 0 or size > 0x10000:
                with self._lock:
                    self._dropped += 1
                return
            # The event names the two ends by address; which of them is the
            # remote one depends on the direction the datagram went.
            if direction == 'out':
                remote_raw, remote_port = daddr, dport
            else:
                remote_raw, remote_port = saddr, sport
            if family == 4:
                remote = socket.inet_ntop(socket.AF_INET,
                                          struct.pack('<I', remote_raw))
            else:
                remote = socket.inet_ntop(socket.AF_INET6, remote_raw)
            index = 0 if direction == 'in' else 1
            keyword = record.EventHeader.EventDescriptor.Keyword
            with self._lock:
                self._keywords |= keyword
                owner = self._by_owner.setdefault(pid, [0, 0])
                owner[index] += size
                peer = self._by_peer.setdefault((remote, remote_port), [0, 0])
                peer[index] += size
        except Exception:
            # A raised exception cannot cross back into the kernel's thread
            # usefully, and one bad event must not stop the session.
            try:
                with self._lock:
                    self._dropped += 1
            except Exception:
                pass

    # -- reading it out ---------------------------------------------------
    def _identity(self, pid):
        if pid not in self.identities:
            self.identities[pid] = process_unique_id(pid)
        return self.identities[pid]

    def sample_all(self):
        import time
        timestamp = time.monotonic()
        with self._lock:
            owners = {pid: list(values) for pid, values in self._by_owner.items()}
            peers = {key: list(values) for key, values in self._by_peer.items()}
            dropped = self._dropped
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
                'interval_seconds': interval, 'dropped_events': dropped,
                'keywords': self._keywords, 'filtered': self.filtered}

    def close(self):
        if self._closed:
            return
        self._closed = True
        library = self._library
        if self._trace.value != INVALID_TRACEHANDLE:
            library.CloseTrace(self._trace)
        # Stopping the session is what makes ProcessTrace return, so it has to
        # happen whatever else failed: a real-time session left behind keeps
        # buffering for nobody.
        _stop_buffer, properties = _properties()
        library.ControlTraceW(self._handle if self._handle.value else 0,
                              SESSION_NAME, ctypes.byref(properties),
                              EVENT_TRACE_CONTROL_STOP)
        del _stop_buffer
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._trace = TRACEHANDLE(INVALID_TRACEHANDLE)
        self._handle = TRACEHANDLE(0)


def build():
    """A started counter, or a reason this machine will not give one."""
    counter = Counter()
    try:
        counter.start()
    except PermissionError as exc:
        counter.close()
        return None, ('elevation', str(exc))
    except OSError as exc:
        counter.close()
        return None, ('refused', str(exc))
    return counter, None
