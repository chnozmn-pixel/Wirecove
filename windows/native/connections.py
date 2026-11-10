#!/usr/bin/env python3
"""Read-only Windows connection snapshot through iphlpapi.

This is the Windows counterpart of the macOS `lsof` snapshot: it lists the
process that owns each socket together with the local and remote endpoint. No
administrator rights are needed and nothing is changed.

Scope limit, stated rather than hidden: Windows' UDP tables
(MIB_UDPROW_OWNER_PID) carry a local endpoint and an owning PID but no remote
address and no byte count, even for connected sockets. There is no remote
endpoint to record, so `snapshot` skips UDP rather than writing an invented
peer, and Windows connection history is TCP only. `udp_sockets` reads the same
tables for what they do hold - which process is holding which local port open -
so the interface can say a program is using UDP without inventing a figure for
how much it moved.
"""
import ctypes
import ctypes.wintypes
import socket
import sys

AF_INET = 2
AF_INET6 = 23
TCP_TABLE_OWNER_PID_ALL = 5
UDP_TABLE_OWNER_PID = 1

TCP_STATES = {
    1: 'CLOSED', 2: 'LISTEN', 3: 'SYN_SENT', 4: 'SYN_RCVD', 5: 'ESTABLISHED',
    6: 'FIN_WAIT1', 7: 'FIN_WAIT2', 8: 'CLOSE_WAIT', 9: 'CLOSING',
    10: 'LAST_ACK', 11: 'TIME_WAIT', 12: 'DELETE_TCB',
}

DWORD = ctypes.wintypes.DWORD


class MIB_TCPROW_OWNER_PID(ctypes.Structure):
    _fields_ = [('dwState', DWORD), ('dwLocalAddr', DWORD),
                ('dwLocalPort', DWORD), ('dwRemoteAddr', DWORD),
                ('dwRemotePort', DWORD), ('dwOwningPid', DWORD)]


class MIB_TCP6ROW_OWNER_PID(ctypes.Structure):
    _fields_ = [('ucLocalAddr', ctypes.c_ubyte * 16), ('dwLocalScopeId', DWORD),
                ('dwLocalPort', DWORD), ('ucRemoteAddr', ctypes.c_ubyte * 16),
                ('dwRemoteScopeId', DWORD), ('dwRemotePort', DWORD),
                ('dwState', DWORD), ('dwOwningPid', DWORD)]


class MIB_UDPROW_OWNER_PID(ctypes.Structure):
    _fields_ = [('dwLocalAddr', DWORD), ('dwLocalPort', DWORD),
                ('dwOwningPid', DWORD)]


class MIB_UDP6ROW_OWNER_PID(ctypes.Structure):
    _fields_ = [('ucLocalAddr', ctypes.c_ubyte * 16), ('dwLocalScopeId', DWORD),
                ('dwLocalPort', DWORD), ('dwOwningPid', DWORD)]


def _port(value):
    """iphlpapi stores ports in network byte order inside a DWORD."""
    return socket.ntohs(value & 0xFFFF)


def _endpoint(address, port):
    return f'[{address}]:{port}' if ':' in address else f'{address}:{port}'


def _query(name, family, row_type, table_kind):
    """Call one of the GetExtended*Table pair twice: once for the size, once
    for the rows.

    The table can grow between the two calls (a connection opens), so the
    buffer is retried a few times rather than parsed at a stale size.
    """
    iphlpapi = ctypes.WinDLL('iphlpapi', use_last_error=True)
    function = getattr(iphlpapi, name)
    size = DWORD(0)
    for _ in range(5):
        function(None, ctypes.byref(size), False, family, table_kind, 0)
        buffer = ctypes.create_string_buffer(max(size.value, ctypes.sizeof(DWORD)))
        result = function(buffer, ctypes.byref(size), False,
                          family, table_kind, 0)
        if result == 122:  # ERROR_INSUFFICIENT_BUFFER: grew, ask again
            continue
        if result != 0:
            raise OSError(f'{name} failed ({result})')
        count = DWORD.from_buffer_copy(buffer.raw[:ctypes.sizeof(DWORD)]).value
        rows = (row_type * count).from_buffer_copy(
            buffer.raw[ctypes.sizeof(DWORD):ctypes.sizeof(DWORD) + count * ctypes.sizeof(row_type)])
        return list(rows)
    raise OSError(f'{name} kept growing')


def _table(family, row_type):
    """Every TCP connection the machine has, with the PID that owns it."""
    return _query('GetExtendedTcpTable', family, row_type, TCP_TABLE_OWNER_PID_ALL)


def _udp_table(family, row_type):
    """Every UDP socket the machine holds open, with the PID that owns it."""
    return _query('GetExtendedUdpTable', family, row_type, UDP_TABLE_OWNER_PID)


def udp_sockets():
    """(pid, family, local address, local port) for every open UDP socket.

    This is the whole of what Windows will say about UDP without a trace or a
    packet capture: who holds which local port. There is deliberately no byte
    count and no remote address here, because the tables carry neither.
    """
    rows = []
    for row in _udp_table(AF_INET, MIB_UDPROW_OWNER_PID):
        address = socket.inet_ntop(socket.AF_INET,
                                   row.dwLocalAddr.to_bytes(4, 'little'))
        rows.append((row.dwOwningPid, 4, address, _port(row.dwLocalPort)))
    for row in _udp_table(AF_INET6, MIB_UDP6ROW_OWNER_PID):
        address = socket.inet_ntop(socket.AF_INET6, bytes(row.ucLocalAddr))
        rows.append((row.dwOwningPid, 6, address, _port(row.dwLocalPort)))
    return rows


def process_names():
    """pid -> executable name via the tool help snapshot. One call for the
    whole machine; names we cannot read stay out of the map and the caller
    falls back to the PID."""
    class PROCESSENTRY32(ctypes.Structure):
        _fields_ = [('dwSize', DWORD), ('cntUsage', DWORD),
                    ('th32ProcessID', DWORD), ('th32DefaultHeapID', ctypes.c_void_p),
                    ('th32ModuleID', DWORD), ('cntThreads', DWORD),
                    ('th32ParentProcessID', DWORD), ('pcPriClassBase', ctypes.c_long),
                    ('dwFlags', DWORD), ('szExeFile', ctypes.c_char * 260)]

    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    snapshot = kernel32.CreateToolhelp32Snapshot(0x00000002, 0)
    if snapshot == ctypes.c_void_p(-1).value:
        return {}
    names = {}
    try:
        entry = PROCESSENTRY32()
        entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
        if not kernel32.Process32First(snapshot, ctypes.byref(entry)):
            return {}
        while True:
            names[entry.th32ProcessID] = entry.szExeFile.decode('mbcs', 'replace')
            if not kernel32.Process32Next(snapshot, ctypes.byref(entry)):
                break
    finally:
        kernel32.CloseHandle(snapshot)
    return names


def snapshot():
    """Yield the same row shape the macOS lsof parser produces."""
    names = process_names()
    for row in _table(AF_INET, MIB_TCPROW_OWNER_PID):
        state = TCP_STATES.get(row.dwState, str(row.dwState))
        if state in ('LISTEN', 'CLOSED', 'DELETE_TCB') or row.dwRemoteAddr == 0:
            continue
        local = socket.inet_ntop(socket.AF_INET, row.dwLocalAddr.to_bytes(4, 'little'))
        remote = socket.inet_ntop(socket.AF_INET, row.dwRemoteAddr.to_bytes(4, 'little'))
        yield dict(pid=row.dwOwningPid,
                   process=names.get(row.dwOwningPid, f'PID {row.dwOwningPid}'),
                   protocol='tcp',
                   local=_endpoint(local, _port(row.dwLocalPort)),
                   remote=_endpoint(remote, _port(row.dwRemotePort)),
                   state=state)
    for row in _table(AF_INET6, MIB_TCP6ROW_OWNER_PID):
        state = TCP_STATES.get(row.dwState, str(row.dwState))
        remote_bytes = bytes(row.ucRemoteAddr)
        if state in ('LISTEN', 'CLOSED', 'DELETE_TCB') or remote_bytes == bytes(16):
            continue
        local = socket.inet_ntop(socket.AF_INET6, bytes(row.ucLocalAddr))
        remote = socket.inet_ntop(socket.AF_INET6, remote_bytes)
        yield dict(pid=row.dwOwningPid,
                   process=names.get(row.dwOwningPid, f'PID {row.dwOwningPid}'),
                   protocol='tcp',
                   local=_endpoint(local, _port(row.dwLocalPort)),
                   remote=_endpoint(remote, _port(row.dwRemotePort)),
                   state=state)


if __name__ == '__main__':
    import json
    if sys.platform != 'win32':
        print('This snapshot requires Windows', file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps(list(snapshot())))
