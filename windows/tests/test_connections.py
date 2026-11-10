import os
import sys
import tempfile
import unittest
from unittest.mock import patch

import connections
import proc_identity
from connection_history import connect, save_snapshot, list_history


SAMPLE = [
    dict(pid=4242, process='chrome.exe', protocol='tcp',
         local='192.168.1.10:51316', remote='172.64.155.209:443', state='ESTABLISHED'),
    dict(pid=4242, process='chrome.exe', protocol='tcp',
         local='192.168.1.10:51317', remote='142.250.74.206:443', state='ESTABLISHED'),
]


class EndpointTests(unittest.TestCase):
    def test_ports_are_read_from_network_byte_order(self):
        # iphlpapi packs the port into a DWORD in network byte order; reading
        # it as a plain integer turns 443 into 46853.
        self.assertEqual(connections._port(0x0000BB01), 443)
        self.assertEqual(connections._port(0xFFFF5000), 80)

    def test_ipv6_endpoints_are_bracketed(self):
        self.assertEqual(connections._endpoint('2001:db8::1', 443), '[2001:db8::1]:443')
        self.assertEqual(connections._endpoint('10.0.0.1', 443), '10.0.0.1:443')

    def test_tcp_state_codes_are_named(self):
        self.assertEqual(connections.TCP_STATES[5], 'ESTABLISHED')
        self.assertEqual(connections.TCP_STATES[2], 'LISTEN')


class IdentityTests(unittest.TestCase):
    @unittest.skipUnless(sys.platform == 'win32', 'process identity requires Windows')
    def test_identity_is_readable_for_our_own_process(self):
        self.assertIsInstance(proc_identity.process_unique_id(os.getpid()), int)

    @unittest.skipUnless(sys.platform == 'win32', 'process identity requires Windows')
    def test_unknown_process_has_no_identity_instead_of_a_guess(self):
        self.assertIsNone(proc_identity.process_unique_id(0x7FFFFFFF))


class HistoryTests(unittest.TestCase):
    def test_same_connection_is_counted_once_and_kept_on_disk(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'history.sqlite3')
            with patch('connection_history.process_unique_id', side_effect=lambda pid: pid + 10):
                db = connect(path)
                try:
                    save_snapshot(db, SAMPLE, 1000)
                    save_snapshot(db, SAMPLE, 1005)
                finally:
                    db.close()
                db = connect(path)
                try:
                    rows = list_history(db)
                finally:
                    db.close()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]['observations'], 2)
        self.assertEqual(rows[0]['first_seen'], 1000)
        self.assertEqual(rows[0]['last_seen'], 1005)
        self.assertEqual(rows[0]['identity'], '4242:4252')

    def test_a_process_with_no_readable_identity_is_skipped(self):
        # Writing the row under the bare PID would merge it with whatever
        # reuses that PID later, inventing a history the machine never had.
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'history.sqlite3')
            with patch('connection_history.process_unique_id', return_value=None):
                db = connect(path)
                try:
                    saved = save_snapshot(db, SAMPLE, 1000)
                    rows = list_history(db)
                finally:
                    db.close()
        self.assertEqual(saved, 0)
        self.assertEqual(rows, [])

    def test_a_reused_pid_is_a_different_application(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'history.sqlite3')
            with patch('connection_history.process_unique_id', return_value=1):
                db = connect(path)
                try:
                    save_snapshot(db, SAMPLE[:1], 1000)
                finally:
                    db.close()
            with patch('connection_history.process_unique_id', return_value=2):
                db = connect(path)
                try:
                    save_snapshot(db, SAMPLE[:1], 1100)
                    rows = list_history(db)
                finally:
                    db.close()
        self.assertEqual(len(rows), 2)
        self.assertEqual({row['identity'] for row in rows}, {'4242:1', '4242:2'})


@unittest.skipUnless(sys.platform == 'win32', 'iphlpapi requires Windows')
class LiveSnapshotTests(unittest.TestCase):
    def test_rows_have_a_remote_endpoint_and_are_tcp(self):
        for row in connections.snapshot():
            self.assertIn(':', row['remote'])
            self.assertEqual(row['protocol'], 'tcp')
            self.assertNotIn(row['state'], ('LISTEN', 'CLOSED', 'DELETE_TCB'))
            self.assertIsInstance(row['pid'], int)
            self.assertTrue(row['process'])


if __name__ == '__main__':
    unittest.main()
