import os
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from connection_history import parse_lsof, connect, save_snapshot, list_history


SAMPLE = '''p3204
cChatGPT
f52
PTCP
n192.168.1.71:51316->172.64.155.209:443
TST=ESTABLISHED
f66
PUDP
n*:*
p3132
crapportd
f8
PTCP
n*:51311
TST=LISTEN
p3205
cBrowser
f11
PUDP
n192.168.1.71:49999->1.1.1.1:443
'''


class HistoryTests(unittest.TestCase):
    def test_parser_keeps_only_connections_with_remote_endpoint(self):
        rows = list(parse_lsof(SAMPLE))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['remote'], '172.64.155.209:443')
        self.assertEqual(rows[0]['state'], 'ESTABLISHED')
        self.assertEqual(rows[1]['protocol'], 'udp')

    def test_history_upserts_same_connection_and_remains_on_disk(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'history.sqlite3')
            with patch('connection_history.process_unique_id', side_effect=lambda pid: pid + 10):
                with connect(path) as db:
                    save_snapshot(db, parse_lsof(SAMPLE), 1000)
                    save_snapshot(db, parse_lsof(SAMPLE), 1005)
                with connect(path) as db:
                    rows = list_history(db)
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]['observations'], 2)
            self.assertEqual(rows[0]['first_seen'], 1000)
            self.assertEqual(rows[0]['last_seen'], 1005)


if __name__ == '__main__':
    unittest.main()
