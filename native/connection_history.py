#!/usr/bin/env python3
"""Read-only lsof snapshot and private SQLite connection history."""
import argparse
import json
import os
import sqlite3
import subprocess
import sys
import time

from netwatch import process_unique_id

RETENTION_SECONDS = 7 * 24 * 60 * 60
MAX_ROWS = 10000


def parse_lsof(output):
    """Yield process connections with a remote endpoint; never infer hostnames."""
    pid = name = None
    entry = {}

    def finish():
        endpoint = entry.get('endpoint', '')
        if pid is None or not name or '->' not in endpoint:
            return None
        local, remote = endpoint.split('->', 1)
        if not local or not remote or remote.startswith('*:'):
            return None
        protocol = entry.get('protocol', '').lower()
        if protocol not in ('tcp', 'udp'):
            return None
        return dict(pid=pid, process=name, protocol=protocol, local=local,
                    remote=remote, state=entry.get('state') or '')

    for line in output.splitlines():
        if not line:
            continue
        field, value = line[0], line[1:]
        if field == 'p':
            result = finish()
            if result:
                yield result
            entry = {}
            pid = int(value) if value.isdigit() else None
            name = None
        elif field == 'c':
            name = value
        elif field == 'f':
            result = finish()
            if result:
                yield result
            entry = {}
        elif field == 'P':
            entry['protocol'] = value
        elif field == 'n':
            entry['endpoint'] = value
        elif field == 'T' and value.startswith('ST='):
            entry['state'] = value[3:]
    result = finish()
    if result:
        yield result


def connect(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    connection = sqlite3.connect(path, timeout=5)
    os.chmod(path, 0o600)
    connection.execute('''CREATE TABLE IF NOT EXISTS connections (
        id INTEGER PRIMARY KEY,
        identity TEXT NOT NULL,
        pid INTEGER NOT NULL,
        process TEXT NOT NULL,
        protocol TEXT NOT NULL,
        local TEXT NOT NULL,
        remote TEXT NOT NULL,
        state TEXT NOT NULL,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        observations INTEGER NOT NULL DEFAULT 1,
        UNIQUE(identity, protocol, local, remote)
    )''')
    connection.execute('CREATE INDEX IF NOT EXISTS idx_connections_seen ON connections(last_seen DESC)')
    return connection


def save_snapshot(connection, entries, now):
    identities = {}
    saved = 0
    with connection:
        for entry in entries:
            pid = entry['pid']
            if pid not in identities:
                identities[pid] = process_unique_id(pid)
            unique = identities[pid]
            if unique is None:
                continue
            connection.execute('''INSERT INTO connections
                (identity,pid,process,protocol,local,remote,state,first_seen,last_seen)
                VALUES (?,?,?,?,?,?,?,?,?)
                ON CONFLICT(identity,protocol,local,remote) DO UPDATE SET
                process=excluded.process, state=excluded.state,
                last_seen=excluded.last_seen, observations=observations+1''',
                (f'{pid}:{unique}', pid, entry['process'], entry['protocol'],
                 entry['local'], entry['remote'], entry['state'], now, now))
            saved += 1
        connection.execute('DELETE FROM connections WHERE last_seen < ?',
                           (now - RETENTION_SECONDS,))
        connection.execute('''DELETE FROM connections WHERE id NOT IN
            (SELECT id FROM connections ORDER BY last_seen DESC LIMIT ?)''',
                           (MAX_ROWS,))
    return saved


def list_history(connection, limit=300):
    connection.row_factory = sqlite3.Row
    return [dict(row) for row in connection.execute('''SELECT id,identity,pid,process,protocol,
        local,remote,state,first_seen,last_seen,observations
        FROM connections ORDER BY last_seen DESC, id DESC LIMIT ?''', (limit,))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True)
    parser.add_argument('--action', choices=('sample', 'list', 'clear'), default='sample')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        parser.error('Live connection history requires macOS')
    try:
        with connect(args.db) as connection:
            if args.action == 'clear':
                with connection:
                    connection.execute('DELETE FROM connections')
                print(json.dumps({'rows': [], 'observedAt': int(time.time() * 1000)}))
                return 0
            if args.action == 'sample':
                proc = subprocess.run(['/usr/sbin/lsof', '-nP', '-iTCP', '-iUDP',
                                       '-FpcnPT'], capture_output=True, text=True,
                                      timeout=8, check=False)
                if proc.returncode not in (0, 1):
                    raise RuntimeError(proc.stderr.strip() or 'lsof failed')
                now = int(time.time())
                save_snapshot(connection, parse_lsof(proc.stdout), now)
            print(json.dumps({'rows': list_history(connection),
                              'observedAt': int(time.time() * 1000)}))
            return 0
    except (OSError, sqlite3.Error, subprocess.TimeoutExpired, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
