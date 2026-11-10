#!/usr/bin/env python3
"""Stable per-incarnation process identity on Windows.

A PID alone is not an identity: Windows reuses it, and treating two different
programs that shared a PID as one process would attribute one's connections to
the other. The process creation time changes whenever the PID is reused, so
PID plus creation time identifies one incarnation.

None means the identity could not be read, and callers must then skip the row
rather than fall back to the bare PID.
"""
import ctypes
import ctypes.wintypes

# Enough to read timings for the user's own processes, and granted without
# administrator rights; PROCESS_QUERY_INFORMATION would need more.
PROCESS_QUERY_LIMITED_INFORMATION = 0x1000


def process_unique_id(pid):
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return None
    creation = ctypes.wintypes.FILETIME()
    exited = ctypes.wintypes.FILETIME()
    kernel = ctypes.wintypes.FILETIME()
    user = ctypes.wintypes.FILETIME()
    try:
        ok = kernel32.GetProcessTimes(handle, ctypes.byref(creation),
                                      ctypes.byref(exited),
                                      ctypes.byref(kernel), ctypes.byref(user))
    finally:
        kernel32.CloseHandle(handle)
    if not ok:
        return None
    return (creation.dwHighDateTime << 32) | creation.dwLowDateTime
