import os
import struct
import tempfile
import unittest
from unittest.mock import patch

import endpoints
import throughput


class ScopeTests(unittest.TestCase):
    def test_addresses_that_never_leave_the_network_are_lan(self):
        for address in ('192.168.1.10', '10.0.0.4', '172.16.9.1', '127.0.0.1',
                        '169.254.3.3', '224.0.0.251', 'fe80::1', 'fd00::5'):
            self.assertEqual(endpoints.scope_for(address), 'lan', address)

    def test_public_addresses_are_wan(self):
        for address in ('8.8.8.8', '93.184.216.34', '2606:4700::1111'):
            self.assertEqual(endpoints.scope_for(address), 'wan', address)

    def test_an_unparseable_address_is_not_called_local(self):
        # Guessing 'lan' would hide traffic; the safe reading is the outside.
        self.assertEqual(endpoints.scope_for('not-an-address'), 'wan')


class ServiceTests(unittest.TestCase):
    def test_well_known_ports_are_named(self):
        self.assertEqual(endpoints.service_for(443), 'HTTPS')
        self.assertEqual(endpoints.service_for(53), 'DNS')

    def test_a_range_is_matched_as_well_as_a_single_port(self):
        self.assertEqual(endpoints.service_for(27020), 'Steam')

    def test_an_unknown_port_is_left_unnamed_rather_than_guessed(self):
        self.assertIsNone(endpoints.service_for(61234))


def write_table(path, rows4=(), rows6=(), generated='2026-01-01'):
    body = b''
    for start, end, code in rows4:
        body += struct.pack('<II', start, end) + code.encode('ascii')
    for start, end, code in rows6:
        body += struct.pack('<QQ', start, end) + code.encode('ascii')
    head = f'{generated} {len(rows4)} {len(rows6)}\n'.encode('ascii')
    with open(path, 'wb') as handle:
        handle.write(endpoints.Countries.MAGIC + head + body)


class CountryTests(unittest.TestCase):
    def test_a_build_without_the_table_says_so_instead_of_answering(self):
        table = endpoints.Countries(os.path.join(tempfile.gettempdir(), 'wc-absent.bin'))
        status = table.status()
        self.assertFalse(status['supported'])
        self.assertEqual(status['reasonKey'], 'missing')
        self.assertIsNone(table.lookup('8.8.8.8'))

    def test_an_address_inside_a_delegated_block_gets_its_country(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'ranges.bin')
            write_table(path, rows4=[(0x08080800, 0x080808FF, 'US'),
                                     (0x5BB80000, 0x5BB8FFFF, 'TR')])
            table = endpoints.Countries(path)
            self.assertTrue(table.status()['supported'])
            self.assertEqual(table.lookup('8.8.8.8'), 'US')
            self.assertEqual(table.lookup('91.184.0.1'), 'TR')

    def test_an_address_in_no_block_is_unknown_not_the_nearest_block(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'ranges.bin')
            write_table(path, rows4=[(0x08080800, 0x080808FF, 'US')])
            table = endpoints.Countries(path)
            self.assertIsNone(table.lookup('8.8.9.1'))
            self.assertIsNone(table.lookup('1.1.1.1'))

    def test_ipv6_is_matched_on_its_prefix(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'ranges.bin')
            write_table(path, rows6=[(0x2606470000000000, 0x2606470000FFFFFF, 'US')])
            table = endpoints.Countries(path)
            self.assertEqual(table.lookup('2606:4700::1111'), 'US')
            self.assertIsNone(table.lookup('2a00:1450::1'))

    def test_a_damaged_table_is_refused_rather_than_half_read(self):
        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, 'ranges.bin')
            with open(path, 'wb') as handle:
                handle.write(endpoints.Countries.MAGIC + b'2026-01-01 4 0\n' + b'\x00\x01')
            table = endpoints.Countries(path)
            self.assertFalse(table.status()['supported'])
            self.assertIsNone(table.lookup('8.8.8.8'))


class PeerBreakdownTests(unittest.TestCase):
    """The host, service, country and LAN/WAN views are four readings of one
    measurement, so they are tested through the collector that produces it."""

    def collector(self):
        instance = throughput.Collector(resolve_names=False)
        self.clock = iter([100.0, 101.0, 102.0])
        patcher = patch('throughput.time.monotonic', lambda: next(self.clock))
        patcher.start()
        self.addCleanup(patcher.stop)
        return instance

    def drive(self, collector, established, counters):
        reads = iter(counters)
        with patch('throughput._established', return_value=established), \
             patch('throughput._enable', return_value=0), \
             patch('throughput._read', lambda _row: next(reads)), \
             patch('throughput.connections.process_names', return_value={10: 'chrome.exe'}), \
             patch.object(collector, '_identity', return_value=99):
            return collector.sample_all()

    def test_two_connections_to_one_host_are_one_row(self):
        collector = self.collector()
        peer = ('93.184.216.34', 443)
        established = [('c1', object(), 10, peer), ('c2', object(), 10, peer)]
        result = self.drive(collector, established, [(100, 50), (300, 150)])
        row, = result['endpoints']
        self.assertEqual(row['address'], '93.184.216.34')
        self.assertEqual(row['port'], 443)
        self.assertEqual(row['service'], 'HTTPS')
        self.assertEqual(row['scope'], 'wan')
        self.assertEqual(row['sockets'], 2)
        self.assertEqual((row['bytes_in'], row['bytes_out']), (400, 200))
        self.assertIsNone(row['bytes_in_per_second'])

    def test_the_second_sample_carries_the_rate_for_the_host(self):
        collector = self.collector()
        peer = ('93.184.216.34', 443)
        established = [('c1', object(), 10, peer)]
        self.drive(collector, established, [(100, 50)])
        result = self.drive(collector, established, [(900, 250)])
        row, = result['endpoints']
        self.assertEqual(row['bytes_in_per_second'], 800.0)
        self.assertEqual(row['bytes_out_per_second'], 200.0)

    def test_a_closed_connection_keeps_its_bytes_under_its_host(self):
        collector = self.collector()
        peer = ('93.184.216.34', 443)
        self.drive(collector, [('c1', object(), 10, peer)], [(700, 300)])
        result = self.drive(collector, [], [])
        row, = result['endpoints']
        self.assertEqual((row['bytes_in'], row['bytes_out']), (700, 300))
        self.assertEqual(row['sockets'], 0)

    def test_the_process_and_host_views_add_up_to_the_same_bytes(self):
        collector = self.collector()
        established = [('c1', object(), 10, ('93.184.216.34', 443)),
                       ('c2', object(), 10, ('192.168.1.1', 53))]
        result = self.drive(collector, established, [(400, 100), (60, 20)])
        processes = sum(row['bytes_in'] for row in result['processes'])
        hosts = sum(row['bytes_in'] for row in result['endpoints'])
        self.assertEqual(processes, hosts)
        self.assertEqual({row['scope'] for row in result['endpoints']}, {'wan', 'lan'})


if __name__ == '__main__':
    unittest.main()
