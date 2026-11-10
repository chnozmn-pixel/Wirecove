#!/usr/bin/env python3
"""Read-only macOS nettop adapter; JSON Lines on stdout, diagnostics on stderr."""
import argparse
import csv
import ctypes
import json
import platform
import os
import signal
import subprocess
import sys
import time


# XNU's proc_uniqidentifierinfo: 16-byte executable UUID followed by a
# uint64 process unique ID. Flavor 17 is PROC_PIDUNIQIDENTIFIERINFO.
_libproc = None


def process_unique_id(pid):
    global _libproc
    if _libproc is None:
        _libproc = ctypes.CDLL('/usr/lib/libproc.dylib', use_errno=True)
        _libproc.proc_pidinfo.argtypes = [ctypes.c_int, ctypes.c_int,
                                          ctypes.c_uint64, ctypes.c_void_p,
                                          ctypes.c_int]
        _libproc.proc_pidinfo.restype = ctypes.c_int
    data = ctypes.create_string_buffer(56)
    count = _libproc.proc_pidinfo(pid, 17, 0, data, len(data))
    if count != len(data):
        return None  # exited or identity unavailable: never compute a rate
    return ctypes.c_uint64.from_buffer_copy(data.raw[16:24]).value


class Rates:
    def __init__(self):
        self.previous = {}
        self.timestamp = None

    def sample(self, timestamp, rows):
        result = []
        dt = None if self.timestamp is None else timestamp - self.timestamp
        for key, (name, incoming, outgoing) in rows.items():
            old = self.previous.get(key)
            state = 'identity_unavailable' if key[2] is None else 'baseline'
            rx = tx = None
            if key[2] is not None and old is not None and dt and dt > 0:
                if incoming < old[1] or outgoing < old[2]:
                    state = 'counter_reset'
                else:
                    state = 'measured'
                    rx, tx = (incoming-old[1])/dt, (outgoing-old[2])/dt
            result.append(dict(pid=key[0], process=name,
                               process_unique_id=key[2],
                               bytes_in=incoming, bytes_out=outgoing,
                               bytes_in_per_second=rx, bytes_out_per_second=tx,
                               interval_seconds=dt, state=state))
        # Dropped processes are forgotten, never differenced after reappearance.
        self.previous = dict(rows)
        self.timestamp = timestamp
        return result


def stream(protocol, samples, pids=(), raw=None):
    cmd = ['/usr/bin/nettop', '-n', '-P', '-x', '-L', str(samples), '-s', '1',
           '-J', 'bytes_in,bytes_out', '-m', protocol]
    for pid in pids:
        cmd += ['-p', str(pid)]
    rates, rows, header, stamp = Rates(), {}, None, None
    # A PTY prevents nettop stdio buffering from corrupting arrival timestamps.
    cmd = ['/usr/bin/script', '-q', '/dev/null'] + cmd
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          text=True, bufsize=1, start_new_session=True) as proc:
        try:
            for line in proc.stdout:
                if raw:
                    raw.write(line)
                    raw.flush()
                fields = next(csv.reader([line]))
                if 'bytes_in' in fields and 'bytes_out' in fields:
                    now = time.monotonic()
                    if header is not None:
                        yield from rates.sample(stamp, rows)
                    header, rows, stamp = fields, {}, now
                    continue
                if header is None or not fields or not fields[0].strip():
                    continue
                name, sep, pid_text = fields[0].rpartition('.')
                if not sep or not pid_text.isdigit():
                    raise RuntimeError('Unexpected nettop process row: ' + repr(fields))
                pid = int(pid_text)
                try:
                    incoming = int(fields[header.index('bytes_in')])
                    outgoing = int(fields[header.index('bytes_out')])
                    if min(incoming, outgoing) < 0:
                        raise ValueError('negative counter')
                except (ValueError, IndexError) as exc:
                    raise RuntimeError('Invalid nettop counters: ' + repr(fields)) from exc
                rows[(pid, name, process_unique_id(pid))] = (name, incoming, outgoing)
            error = proc.stderr.read().strip()
            if proc.wait() != 0:
                raise RuntimeError('nettop failed: ' + error)
            if header is None:
                raise RuntimeError('nettop returned no CSV samples')
            yield from rates.sample(stamp, rows)
        finally:
            if proc.poll() is None:
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--protocol', choices=['tcp', 'udp'], default='tcp')
    parser.add_argument('--samples', type=int, default=10, help='0 = continuous; default 10')
    parser.add_argument('--pid', type=int, action='append', default=[])
    args = parser.parse_args()
    if args.samples < 0 or any(pid <= 0 for pid in args.pid):
        parser.error('samples must be >= 0 and PID > 0')
    if platform.system() != 'Darwin':
        parser.error('Live collection requires macOS')
    def stop_cleanly(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, stop_cleanly)
    try:
        for row in stream(args.protocol, args.samples, args.pid):
            print(json.dumps(dict(protocol=args.protocol, **row)), flush=True)
    except KeyboardInterrupt:
        return 130
    except (OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
