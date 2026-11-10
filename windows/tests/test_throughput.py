import sys
import unittest
from unittest.mock import patch

import throughput


class RateTests(unittest.TestCase):
    """The collector is driven through _collect so the arithmetic is tested
    without depending on which connections the machine happens to have."""

    def collector(self, totals):
        # The clock is driven by the test: Windows' monotonic clock has a
        # ~16 ms resolution, so two real samples in a row can land on the
        # same tick and leave no interval to divide by.
        instance = throughput.Collector(resolve_names=False)
        self.sequence = list(totals)
        self.clock = iter([100.0 + index for index in range(len(self.sequence) + 1)])
        instance._collect = lambda: (self.sequence.pop(0), {})
        patcher = patch('throughput.time.monotonic', lambda: next(self.clock))
        patcher.start()
        self.addCleanup(patcher.stop)
        return instance

    def test_first_sample_is_a_baseline_and_carries_no_rate(self):
        collector = self.collector([{(10, 99): ('chrome.exe', 1000, 500)}])
        row, = collector.sample()
        self.assertEqual(row['state'], 'baseline')
        self.assertIsNone(row['bytes_in_per_second'])
        self.assertIsNone(row['bytes_out_per_second'])
        self.assertEqual(row['bytes_in'], 1000)

    def test_second_sample_divides_the_difference_by_the_interval(self):
        collector = self.collector([
            {(10, 99): ('chrome.exe', 1000, 500)},
            {(10, 99): ('chrome.exe', 3000, 1500)},
        ])
        collector.sample()
        row, = collector.sample()
        self.assertEqual(row['state'], 'measured')
        self.assertEqual(row['interval_seconds'], 1.0)
        self.assertEqual(row['bytes_in_per_second'], 2000.0)
        self.assertEqual(row['bytes_out_per_second'], 1000.0)

    def test_a_process_with_no_readable_identity_gets_no_rate(self):
        # A PID on its own is not an identity: Windows reuses it, so a rate
        # computed from it could belong to two different programs.
        collector = self.collector([
            {(10, None): ('gone.exe', 1000, 500)},
            {(10, None): ('gone.exe', 9000, 9000)},
        ])
        collector.sample()
        row, = collector.sample()
        self.assertEqual(row['state'], 'identity_unavailable')
        self.assertIsNone(row['bytes_in_per_second'])

    def test_a_counter_that_falls_is_reported_not_turned_negative(self):
        collector = self.collector([
            {(10, 99): ('chrome.exe', 5000, 5000)},
            {(10, 99): ('chrome.exe', 1000, 1000)},
        ])
        collector.sample()
        row, = collector.sample()
        self.assertEqual(row['state'], 'counter_reset')
        self.assertIsNone(row['bytes_in_per_second'])
        self.assertIsNone(row['bytes_out_per_second'])

    def test_a_reused_pid_is_measured_as_a_different_application(self):
        collector = self.collector([
            {(10, 1): ('first.exe', 1000, 1000)},
            {(10, 2): ('second.exe', 4000, 4000)},
        ])
        collector.sample()
        row, = collector.sample()
        self.assertEqual(row['process'], 'second.exe')
        self.assertEqual(row['state'], 'baseline')
        self.assertIsNone(row['bytes_in_per_second'])


class IdentityFormatTests(unittest.TestCase):
    """The collector and the history writer have to name the same process the
    same way, or the interface cannot join a rate to its connections."""

    def test_identity_is_a_string_because_a_filetime_outgrows_a_json_number(self):
        unique = 134386906751475882  # a real process creation time
        self.assertGreater(unique, 2 ** 53)
        collector = throughput.Collector(resolve_names=False)
        collector._collect = lambda: ({(57340, unique): ('chat.exe', 10, 20)}, {})
        row, = collector.sample()
        self.assertIsInstance(row['identity'], str)
        self.assertIsInstance(row['process_unique_id'], str)
        self.assertEqual(row['identity'], '57340:134386906751475882')

    def test_the_identity_matches_the_one_the_history_writer_stores(self):
        import os
        import tempfile
        from unittest.mock import patch as patch_target
        from connection_history import connect, save_snapshot, list_history
        unique = 134386906751475882
        entry = dict(pid=57340, process='chat.exe', protocol='tcp',
                     local='10.0.0.2:5000', remote='1.1.1.1:443', state='ESTABLISHED')
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'history.sqlite3')
            with patch_target('connection_history.process_unique_id', return_value=unique):
                database = connect(path)
                try:
                    save_snapshot(database, [entry], 1000)
                    stored, = list_history(database)
                finally:
                    database.close()
        collector = throughput.Collector(resolve_names=False)
        collector._collect = lambda: ({(57340, unique): ('chat.exe', 10, 20)}, {})
        measured, = collector.sample()
        self.assertEqual(measured['identity'], stored['identity'])


class RetiredConnectionTests(unittest.TestCase):
    """Bytes a closed connection moved stay with the process that owned it,
    so a total never falls when a socket closes."""

    def test_a_closed_connection_keeps_its_bytes_under_its_process(self):
        collector = throughput.Collector(resolve_names=False)
        collector.enabled = {'c1', 'c2'}
        collector.connections = {
            'c1': ((10, 99), 400, 100),
            'c2': ((10, 99), 600, 200),
        }
        established = [('c1', object(), 10, ('93.184.216.34', 443))]
        with patch('throughput._established', return_value=established), \
             patch('throughput._enable', return_value=0), \
             patch('throughput._read', return_value=(500, 150)), \
             patch('throughput.connections.process_names', return_value={10: 'chrome.exe'}), \
             patch.object(collector, '_identity', return_value=99):
            totals, _peers = collector._collect()
        # c1 is still open at 500/150; c2 closed carrying 600/200.
        self.assertEqual(totals[(10, 99)], ('chrome.exe', 1100, 350))
        self.assertNotIn('c2', collector.connections)
        self.assertNotIn('c2', collector.enabled)

    def test_a_process_with_only_closed_connections_still_appears(self):
        collector = throughput.Collector(resolve_names=False)
        collector.retired = {(10, 99): [800, 300]}
        with patch('throughput._established', return_value=[]), \
             patch('throughput.connections.process_names', return_value={}):
            totals, _peers = collector._collect()
        self.assertEqual(totals[(10, 99)], ('PID 10', 800, 300))


class AvailabilityTests(unittest.TestCase):
    def test_access_denied_is_reported_as_needing_elevation(self):
        rows = [('k', object(), 1, ('1.1.1.1', 443))]
        with patch('throughput._established', return_value=rows), \
             patch('throughput._enable', return_value=throughput.ERROR_ACCESS_DENIED):
            supported, key, reason = throughput.available()
        self.assertFalse(supported)
        self.assertEqual(key, 'elevation')
        self.assertIn('administrator', reason)

    def test_no_connection_is_not_reported_as_unsupported(self):
        # Nothing to measure yet is a different answer from cannot measure.
        with patch('throughput._established', return_value=[]):
            supported, key, _reason = throughput.available()
        self.assertFalse(supported)
        self.assertEqual(key, 'idle')

    def test_one_connection_accepting_collection_is_enough(self):
        rows = [('a', object(), 1, ('1.1.1.1', 443)),
                ('b', object(), 2, ('8.8.8.8', 53))]
        with patch('throughput._established', return_value=rows), \
             patch('throughput._enable', side_effect=[1168, 0]):
            supported, key, reason = throughput.available()
        self.assertTrue(supported)
        self.assertIsNone(key)
        self.assertIsNone(reason)


@unittest.skipUnless(sys.platform == 'win32', 'TCP EStats requires Windows')
class LiveTests(unittest.TestCase):
    def test_the_connection_key_separates_the_two_address_families(self):
        families = {key[0] for key, _row, _pid, _peer in throughput._established()}
        self.assertTrue(families <= {4, 6})

    def test_available_answers_without_raising(self):
        supported, key, reason = throughput.available()
        self.assertIsInstance(supported, bool)
        self.assertEqual(supported, key is None)
        self.assertEqual(supported, reason is None)


if __name__ == '__main__':
    unittest.main()
