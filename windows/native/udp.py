#!/usr/bin/env python3
"""Per-process UDP activity, by whichever of three routes the user chose.

TCP can be measured exactly: a connection is an object the kernel keeps, and
RFC 4898 hangs a byte counter on it. UDP has no connection, so Windows keeps no
counter to read. What the UDP tables hold is who is holding which local port
open - nothing about how much moved, and not even who the other end is.

So UDP is not one capability with one answer. It is a choice between routes
that cost different things and are worth different amounts, and the choice is
the user's rather than ours. This module is the front end for all of them:

  off        Nothing is read. The interface says UDP is not being measured, so
             the totals it does show are TCP only and say so.

  sockets    The UDP tables, and only them. Which process holds which local
             port, how many sockets it has. No bytes, because there are none
             to read; the rows carry null and the interface prints why rather
             than a zero. Needs no administrator rights and reads nothing but
             a table Windows already maintains.

  etw        Windows' own event stream (Microsoft-Windows-Kernel-Network).
             The kernel announces every datagram with the owning process, the
             byte count and both endpoints, so this is a measurement and not an
             estimate. Needs administrator rights. Costs one event per
             datagram, which is why it is aggregated in a worker thread and
             only reported once per interval.

  windivert  The WinDivert driver that already ships for the DPI engine, in
             sniff mode. It sees the packets, so it sees the sizes and the
             remote addresses, but it does not know which process sent them:
             that has to be joined back through the local port, and a short
             lived socket can close before the join happens. It also sits in
             the packet path. It is offered because the user asked for it to
             be, and the interface says plainly what it gives up.

Every mode reports the same row shape as throughput.py, with protocol 'udp',
so the interface adds them to the same per-application rows it already draws.
A mode that cannot run says why; none of them is ever reported as working when
it is not.
"""
import argparse
import json
import signal
import sys
import time

import connections
from proc_identity import process_unique_id

MODES = ('off', 'sockets', 'etw', 'windivert')


def describe(mode):
    """What the mode gives, for the interface to show beside the choice."""
    return {
        'off': dict(bytes=False, peers=False, elevation=False),
        'sockets': dict(bytes=False, peers=False, elevation=False),
        'etw': dict(bytes=True, peers=True, elevation=True),
        'windivert': dict(bytes=True, peers=True, elevation=True),
    }[mode]


class Sockets:
    """The UDP tables, reported for what they hold and no more.

    There is no byte count anywhere in this class, deliberately. It answers
    'which programs are using UDP, and on how many sockets', which is true and
    useful, and it refuses to answer 'how much', which it cannot know.
    """

    gives_bytes = False
    gives_peers = False

    def __init__(self):
        self.identities = {}

    def _identity(self, pid):
        if pid not in self.identities:
            self.identities[pid] = process_unique_id(pid)
        return self.identities[pid]

    def sample_all(self):
        names = connections.process_names()
        owners = {}
        for pid, family, address, port in connections.udp_sockets():
            owner = (pid, self._identity(pid))
            entry = owners.setdefault(owner, {'ports': set(), 'sockets': 0,
                                              'families': set()})
            entry['sockets'] += 1
            entry['ports'].add(port)
            entry['families'].add(family)
        rows = []
        for owner, entry in owners.items():
            pid = owner[0]
            rows.append(dict(
                pid=pid, process=names.get(pid, f'PID {pid}'),
                process_unique_id=None if owner[1] is None else str(owner[1]),
                identity=f'{owner[0]}:{owner[1]}',
                sockets=entry['sockets'],
                # The lowest ports first, and only a handful: this is for
                # recognising what the socket is for, not a port scan report.
                ports=sorted(entry['ports'])[:12],
                bytes_in=None, bytes_out=None,
                bytes_in_per_second=None, bytes_out_per_second=None,
                interval_seconds=None, state='not_measured'))
        return {'processes': rows, 'endpoints': [], 'interval_seconds': None}

    def close(self):
        pass


def build(mode):
    """The collector for one mode, or a reason it cannot be built."""
    if mode == 'sockets':
        return Sockets(), None
    if mode == 'etw':
        import udp_etw
        return udp_etw.build()
    if mode == 'windivert':
        import udp_divert
        return udp_divert.build()
    raise ValueError(f'unknown mode {mode!r}')


def available(mode):
    """Whether this mode can run here, and why not when it cannot.

    Each mode is asked rather than guessed at, the same way the TCP side asks
    the kernel: whether a trace session can be started or a driver opened
    depends on this process's token, not on anything readable from
    configuration.
    """
    if sys.platform != 'win32':
        return False, 'platform', 'UDP measurement only exists on Windows'
    if mode == 'off':
        return True, None, None
    if mode not in MODES:
        return False, 'unknown', f'No such mode: {mode}'
    try:
        collector, reason = build(mode)
    except ImportError as exc:
        return False, 'missing', str(exc)
    except OSError as exc:
        return False, 'refused', str(exc)
    if collector is None:
        return False, reason[0], reason[1]
    collector.close()
    return True, None, None


def stream(mode, samples, interval):
    collector, reason = build(mode)
    if collector is None:
        raise OSError(reason[1])
    produced = 0
    try:
        while samples == 0 or produced < samples:
            if produced:
                time.sleep(interval)
            measurement = collector.sample_all()
            for row in measurement['processes']:
                yield dict(kind='process', protocol='udp', mode=mode,
                           sample=produced, **row)
            for row in measurement['endpoints']:
                yield dict(kind='endpoint', protocol='udp', mode=mode,
                           sample=produced, **row)
            produced += 1
    finally:
        collector.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=[m for m in MODES if m != 'off'],
                        default='sockets')
    parser.add_argument('--samples', type=int, default=10, help='0 = continuous')
    parser.add_argument('--interval', type=float, default=1.0)
    parser.add_argument('--check', action='store_true',
                        help='report whether this mode can run here')
    args = parser.parse_args()
    if args.samples < 0 or args.interval <= 0:
        parser.error('samples must be >= 0 and interval > 0')
    if sys.platform != 'win32':
        parser.error('UDP measurement requires Windows')
    if args.check:
        report = {}
        for mode in MODES:
            supported, key, reason = available(mode)
            report[mode] = dict(supported=supported, reasonKey=key,
                                reason=reason, **describe(mode))
        print(json.dumps(dict(modes=report)))
        return 0

    def stop_cleanly(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop_cleanly)
    try:
        for row in stream(args.mode, args.samples, args.interval):
            print(json.dumps(row), flush=True)
    except KeyboardInterrupt:
        return 130
    except OSError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
