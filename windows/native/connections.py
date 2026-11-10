#!/usr/bin/env python3
"""Read-only Windows connection snapshot through iphlpapi.

This is the Windows counterpart of the macOS `lsof` snapshot: it lists the
process that owns each socket together with the local and remote endpoint. No
administrator rights are needed and nothing is changed.

Scope limit, stated rather than hidden: Windows' UDP tables
(MIB_UDPROW_OWNER_PID) carry a local endpoint and an owning PID but no remote
address, even for connected sockets. There is no remote endpoint to record, so
UDP rows are skipped instead of being written with an invented peer. Windows
connection history is therefore TCP only.
"""
import ctypes
import ctypes.wintypes
import socket
import sys

AF_INET = 2
AF_INET6 = 23
TCP_TABLE_OWNER_PID_ALL = 5

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


def _port(value):
    """iphlpapi stores ports in network byte order inside a DWORD."""
    return socket.ntohs(value & 0xFFFF)


def _endpoint(address, port):
    return f'[{address}]:{port}' if ':' in address else f'{address}:{port}'


def _table(family, row_type):
    """Call GetExtendedTcpTable twice: once for the size, once for the rows.

    The table can grow between the two calls (a connection opens), so the
    buffer is retried a few times rather than parsed at a stale size.
    """
    iphlpapi = ctypes.WinDLL('iphlpapi', use_last_error=True)
    size = DWORD(0)
    for _ in range(5):
        iphlpapi.GetExtendedTcpTable(None, ctypes.byref(size), False,
                                     family, TCP_TABLE_OWNER_PID_ALL, 0)
        buffer = ctypes.create_string_buffer(max(size.value, ctypes.sizeof(DWORD)))
        result = iphlpapi.GetExtendedTcpTable(buffer, ctypes.byref(size), False,
                                              family, TCP_TABLE_OWNER_PID_ALL, 0)
        if result == 122:  # ERROR_INSUFFICIENT_BUFFER: grew, ask again
            continue
        if result != 0:
            raise OSError(f'GetExtendedTcpTable failed ({result})')
        count = DWORD.from_buffer_copy(buffer.raw[:ctypes.sizeof(DWORD)]).value
        rows = (row_type * count).from_buffer_copy(
            buffer.raw[ctypes.sizeof(DWORD):ctypes.sizeof(DWORD) + count * ctypes.sizeof(row_type)])
        return list(rows)
    raise OSError('GetExtendedTcpTable kept growing')


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
