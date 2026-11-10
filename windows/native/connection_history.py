#!/usr/bin/env python3
"""Private SQLite connection history for the Windows app.

Rows come from `connections.py` (iphlpapi, read-only, no administrator rights).
Retention is at most 7 days or 10,000 connections, in a database under
Wirecove's own application data folder; nothing leaves the machine and no
hostname is ever inferred from an address.
"""
import argparse
import json
import os
import sqlite3
import sys
import time

import connections
from proc_identity import process_unique_id

RETENTION_SECONDS = 7 * 24 * 60 * 60
MAX_ROWS = 10000


def connect(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    connection = sqlite3.connect(path, timeout=5)
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
                # Identity unreadable: recording it under the bare PID would
                # merge this row with whatever reuses that PID later.
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
    if sys.platform != 'win32':
        parser.error('This history source requires Windows')
    connection = None
    try:
        # sqlite3's context manager commits but does not close, and an open
        # database keeps a lock on the file; the handle is released below.
        connection = connect(args.db)
        if args.action == 'clear':
            with connection:
                connection.execute('DELETE FROM connections')
            print(json.dumps({'rows': [], 'observedAt': int(time.time() * 1000)}))
            return 0
        if args.action == 'sample':
            save_snapshot(connection, connections.snapshot(), int(time.time()))
        print(json.dumps({'rows': list_history(connection),
                          'observedAt': int(time.time() * 1000)}))
        return 0
    except (OSError, sqlite3.Error, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    finally:
        if connection is not None:
            connection.close()


if __name__ == '__main__':
    sys.exit(main())
