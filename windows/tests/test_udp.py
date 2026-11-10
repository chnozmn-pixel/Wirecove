"""The UDP routes' pure logic, without a trace session or a driver.

What is testable here is the part that gets the answer wrong quietly: byte
order, which end of a datagram is the remote one, where a UDP header starts
when the IP header is not the usual twenty bytes, and whether a route that
cannot count bytes says so instead of reporting zero. The parts that need
administrator rights are exercised by hand against known traffic; these are
the parts that would otherwise regress without anyone noticing.
"""
import socket
import struct
import sys
import unittest
from unittest.mock import patch

import udp
import udp_etw
import udp_divert


def etw_payload(pid, size, destination, source, dport, sport, family=4):
    """One Microsoft-Windows-Kernel-Network UDP event payload."""
    if family == 4:
        return struct.pack(
            '<IIIIHH', pid, size,
            int.from_bytes(socket.inet_aton(destination), 'little'),
            int.from_bytes(socket.inet_aton(source), 'little'),
            socket.htons(dport), socket.htons(sport))
    return struct.pack(
        '<II16s16sHH', pid, size,
        socket.inet_pton(socket.AF_INET6, destination),
        socket.inet_pton(socket.AF_INET6, source),
        socket.htons(dport), socket.htons(sport))


def ip_packet(source, destination, sport, dport, payload=b'abcd',
              protocol=udp_divert.IPPROTO_UDP, options=0):
    """An IPv4 packet carrying a UDP datagram, with optional IP options."""
    header_words = 5 + options
    first = (4 << 4) | header_words
    udp_length = 8 + len(payload)
    header = struct.pack('>BBHHHBBH4s4s', first, 0, header_words * 4 + udp_length,
                         0, 0, 64, protocol, 0,
                         socket.inet_aton(source), socket.inet_aton(destination))
    header += b'\x00' * (options * 4)
    datagram = struct.pack('>HHHH', sport, dport, udp_length, 0) + payload
    return header + datagram


def ipv6_packet(source, destination, sport, dport, payload=b'abcd',
                next_header=udp_divert.IPPROTO_UDP):
    udp_length = 8 + len(payload)
    header = struct.pack('>IHBB', (6 << 28), udp_length, next_header, 64)
    header += socket.inet_pton(socket.AF_INET6, source)
    header += socket.inet_pton(socket.AF_INET6, destination)
    datagram = struct.pack('>HHHH', sport, dport, udp_length, 0) + payload
    return header + datagram


class EtwDecodeTests(unittest.TestCase):
    def test_ports_are_read_from_network_byte_order(self):
        # Read as little-endian integers these come out byte-swapped: 53 as
        # 13568 and 443 as 47873, which files the datagram under a port
        # nothing uses.
        payload = etw_payload(99, 100, '1.1.1.1', '10.0.0.2', 53, 50000)
        self.assertEqual(udp_etw.decode(udp_etw.UDP_SENT_V4, payload)[3], 53)
        payload = etw_payload(99, 100, '1.1.1.1', '10.0.0.2', 443, 50000)
        self.assertEqual(udp_etw.decode(udp_etw.UDP_SENT_V4, payload)[3], 443)

    def test_an_outbound_datagram_reports_the_destination_as_remote(self):
        payload = etw_payload(4242, 1200, '1.1.1.1', '192.168.1.5', 53, 50001)
        pid, size, remote, port, direction = udp_etw.decode(
            udp_etw.UDP_SENT_V4, payload)
        self.assertEqual((pid, size, remote, port, direction),
                         (4242, 1200, '1.1.1.1', 53, 'out'))

    def test_an_inbound_datagram_reports_the_source_as_remote(self):
        # Same payload, other event: which end is the far one is the direction,
        # not a field. Getting this backwards would file every reply under this
        # machine's own address.
        payload = etw_payload(4242, 1200, '192.168.1.5', '1.1.1.1', 50001, 53)
        _pid, _size, remote, port, direction = udp_etw.decode(
            udp_etw.UDP_RECV_V4, payload)
        self.assertEqual((remote, port, direction), ('1.1.1.1', 53, 'in'))

    def test_ipv6_events_are_decoded_with_sixteen_byte_addresses(self):
        payload = etw_payload(7, 64, '2001:db8::1', '2001:db8::2', 443, 51000,
                              family=6)
        _pid, size, remote, port, _direction = udp_etw.decode(
            udp_etw.UDP_SENT_V6, payload)
        self.assertEqual((size, remote, port), (64, '2001:db8::1', 443))

    def test_an_event_that_is_not_udp_is_ignored(self):
        payload = etw_payload(1, 1, '1.1.1.1', '1.1.1.2', 1, 2)
        self.assertIsNone(udp_etw.decode(10, payload))  # a TCP event id

    def test_a_short_or_absent_payload_is_refused_rather_than_parsed(self):
        payload = etw_payload(1, 10, '1.1.1.1', '1.1.1.2', 1, 2)
        self.assertIsNone(udp_etw.decode(udp_etw.UDP_SENT_V4, payload[:8]))
        self.assertIsNone(udp_etw.decode(udp_etw.UDP_SENT_V4, None))

    def test_an_impossible_size_is_refused(self):
        # Larger than a datagram can be: the payload is not what was expected,
        # so it is dropped rather than added to somebody's total.
        payload = etw_payload(1, 0x20000, '1.1.1.1', '1.1.1.2', 1, 2)
        self.assertIsNone(udp_etw.decode(udp_etw.UDP_SENT_V4, payload))
        payload = etw_payload(1, 0, '1.1.1.1', '1.1.1.2', 1, 2)
        self.assertIsNone(udp_etw.decode(udp_etw.UDP_SENT_V4, payload))

    def test_the_four_udp_events_are_the_only_ones_wanted(self):
        self.assertEqual(sorted(udp_etw.UDP_EVENTS), [42, 43, 58, 59])

    @unittest.skipUnless(sys.platform == 'win32', 'the structures are Windows')
    def test_the_trace_structures_match_the_sizes_windows_expects(self):
        # A wrong size here does not fail loudly: it puts a callback pointer at
        # the wrong offset, and the kernel calls into the middle of a struct.
        import ctypes
        for structure, expected in (
                (udp_etw.EVENT_TRACE_PROPERTIES, 120),
                (udp_etw.WNODE_HEADER, 48),
                (udp_etw.EVENT_TRACE_HEADER, 48),
                (udp_etw.EVENT_TRACE, 88),
                (udp_etw.EVENT_HEADER, 80),
                (udp_etw.EVENT_RECORD, 112),
                (udp_etw.TIME_ZONE_INFORMATION, 172),
                (udp_etw.EVENT_TRACE_LOGFILEW, 448)):
            self.assertEqual(ctypes.sizeof(structure), expected,
                             structure.__name__)


class DivertParseTests(unittest.TestCase):
    def test_an_outbound_packet_names_this_machine_as_local(self):
        packet = ip_packet('192.168.1.5', '1.1.1.1', 50001, 53, b'x' * 20)
        local, local_port, remote, remote_port, payload = udp_divert._parse(
            packet, len(packet), outbound=True, ipv6=False)
        self.assertEqual((local, local_port), ('192.168.1.5', 50001))
        self.assertEqual((remote, remote_port), ('1.1.1.1', 53))
        self.assertEqual(payload, 20)

    def test_an_inbound_packet_swaps_which_end_is_local(self):
        packet = ip_packet('1.1.1.1', '192.168.1.5', 53, 50001, b'x' * 20)
        local, local_port, remote, remote_port, _payload = udp_divert._parse(
            packet, len(packet), outbound=False, ipv6=False)
        self.assertEqual((local, local_port), ('192.168.1.5', 50001))
        self.assertEqual((remote, remote_port), ('1.1.1.1', 53))

    def test_ip_options_move_where_the_udp_header_starts(self):
        # A header longer than twenty bytes is legal and rare. Reading the UDP
        # header at a fixed offset would take two bytes of the options as the
        # source port.
        packet = ip_packet('10.0.0.1', '10.0.0.2', 1234, 5678, b'y' * 8,
                           options=2)
        _local, local_port, _remote, remote_port, payload = udp_divert._parse(
            packet, len(packet), outbound=True, ipv6=False)
        self.assertEqual((local_port, remote_port, payload), (1234, 5678, 8))

    def test_the_payload_is_the_datagram_without_its_own_header(self):
        # The same quantity the ETW route and the TCP side report, so the three
        # can be compared.
        packet = ip_packet('10.0.0.1', '10.0.0.2', 1, 2, b'z' * 100)
        self.assertEqual(udp_divert._parse(packet, len(packet), True, False)[4],
                         100)

    def test_a_truncated_capture_does_not_report_more_than_was_captured(self):
        packet = ip_packet('10.0.0.1', '10.0.0.2', 1, 2, b'z' * 100)
        cut = len(packet) - 40
        payload = udp_divert._parse(packet[:cut], cut, True, False)[4]
        self.assertEqual(payload, 60)

    def test_a_packet_that_is_not_udp_is_refused(self):
        packet = ip_packet('10.0.0.1', '10.0.0.2', 1, 2, protocol=6)
        self.assertIsNone(udp_divert._parse(packet, len(packet), True, False))

    def test_a_packet_too_short_to_hold_a_datagram_is_refused(self):
        packet = ip_packet('10.0.0.1', '10.0.0.2', 1, 2)
        self.assertIsNone(udp_divert._parse(packet[:12], 12, True, False))

    def test_ipv6_packets_are_parsed_from_their_own_offsets(self):
        packet = ipv6_packet('2001:db8::5', '2001:db8::1', 51000, 443, b'q' * 16)
        local, local_port, remote, remote_port, payload = udp_divert._parse(
            packet, len(packet), outbound=True, ipv6=True)
        self.assertEqual((local, local_port), ('2001:db8::5', 51000))
        self.assertEqual((remote, remote_port), ('2001:db8::1', 443))
        self.assertEqual(payload, 16)

    def test_an_ipv6_extension_header_chain_is_not_followed(self):
        # Not guessed at: a chain this module does not walk is refused, and the
        # packet is counted as unparsed rather than attributed wrongly.
        packet = ipv6_packet('2001:db8::5', '2001:db8::1', 1, 2,
                             next_header=43)
        self.assertIsNone(udp_divert._parse(packet, len(packet), True, True))


class DivertOwnerTests(unittest.TestCase):
    """The join from a packet back to a process."""

    def setUp(self):
        self.counter = udp_divert.Counter()

    def test_the_local_address_is_part_of_the_key(self):
        # Two processes on the same port number, different addresses. Joining
        # on the number alone put one program's bytes under the other and read
        # high against known traffic.
        table = [(111, 4, '192.168.1.5', 5000), (222, 4, '10.0.0.9', 5000)]
        with patch.object(udp_divert.connections, 'udp_sockets', return_value=table):
            self.assertEqual(self.counter._owner_for('192.168.1.5', 5000), 111)
            self.assertEqual(self.counter._owner_for('10.0.0.9', 5000), 222)

    def test_a_wildcard_socket_answers_for_an_interface_address(self):
        # A socket bound to 0.0.0.0 is listed as such while its packets carry
        # the address of the interface they left by.
        table = [(333, 4, '0.0.0.0', 5353)]
        with patch.object(udp_divert.connections, 'udp_sockets', return_value=table):
            self.assertEqual(self.counter._owner_for('192.168.1.5', 5353), 333)

    def test_an_exact_match_wins_over_the_wildcard(self):
        table = [(333, 4, '0.0.0.0', 5353), (444, 4, '192.168.1.5', 5353)]
        with patch.object(udp_divert.connections, 'udp_sockets', return_value=table):
            self.assertEqual(self.counter._owner_for('192.168.1.5', 5353), 444)

    def test_a_port_nobody_holds_has_no_owner(self):
        with patch.object(udp_divert.connections, 'udp_sockets', return_value=[]):
            self.assertIsNone(self.counter._owner_for('192.168.1.5', 5000))


class SocketsModeTests(unittest.TestCase):
    """The route that counts nothing, and says so."""

    TABLE = [
        (10, 4, '0.0.0.0', 5353), (10, 4, '0.0.0.0', 5354),
        (10, 6, '::', 5353), (20, 4, '0.0.0.0', 53),
    ]

    def rows(self):
        with patch.object(udp.connections, 'udp_sockets', return_value=self.TABLE), \
             patch.object(udp.connections, 'process_names',
                          return_value={10: 'chrome.exe', 20: 'svchost.exe'}), \
             patch.object(udp, 'process_unique_id', return_value=1):
            return udp.Sockets().sample_all()['processes']

    def test_sockets_are_counted_per_process(self):
        rows = {row['process']: row for row in self.rows()}
        self.assertEqual(rows['chrome.exe']['sockets'], 3)
        self.assertEqual(rows['svchost.exe']['sockets'], 1)

    def test_the_ports_are_listed_once_and_in_order(self):
        rows = {row['process']: row for row in self.rows()}
        self.assertEqual(rows['chrome.exe']['ports'], [5353, 5354])

    def test_no_byte_figure_is_reported_where_there_is_none_to_read(self):
        # Null rather than zero: a zero would be read as "this program moved
        # nothing", which is a claim this route cannot make.
        for row in self.rows():
            self.assertIsNone(row['bytes_in'])
            self.assertIsNone(row['bytes_out'])
            self.assertIsNone(row['bytes_in_per_second'])
            self.assertEqual(row['state'], 'not_measured')


class ModeTests(unittest.TestCase):
    def test_off_is_a_mode_and_is_always_allowed(self):
        self.assertIn('off', udp.MODES)
        if sys.platform == 'win32':
            self.assertEqual(udp.available('off'), (True, None, None))

    def test_only_the_two_tracing_routes_claim_to_count_bytes(self):
        self.assertFalse(udp.describe('off')['bytes'])
        self.assertFalse(udp.describe('sockets')['bytes'])
        self.assertTrue(udp.describe('etw')['bytes'])
        self.assertTrue(udp.describe('windivert')['bytes'])

    def test_the_routes_that_need_administrator_rights_say_so(self):
        self.assertFalse(udp.describe('sockets')['elevation'])
        self.assertTrue(udp.describe('etw')['elevation'])
        self.assertTrue(udp.describe('windivert')['elevation'])

    def test_an_unknown_mode_is_refused_rather_than_defaulted(self):
        supported, key, _reason = udp.available('sniff-everything')
        self.assertFalse(supported)
        self.assertIn(key, ('unknown', 'platform'))

    @unittest.skipUnless(sys.platform == 'win32', 'the check is Windows')
    def test_checking_a_mode_starts_nothing(self):
        # Reporting whether a route is available must not open a driver or a
        # trace session: a kernel driver loaded to populate a greyed-out menu
        # entry would be the wrong trade.
        with patch.object(udp, 'build',
                          side_effect=AssertionError('build was called')):
            udp.available('sockets')
            udp.available('etw')
            udp.available('windivert')

    @unittest.skipUnless(sys.platform == 'win32', 'the check is Windows')
    def test_without_administrator_rights_the_tracing_routes_are_refused(self):
        with patch.object(udp, 'elevated', return_value=False):
            for mode in ('etw', 'windivert'):
                supported, key, reason = udp.available(mode)
                self.assertFalse(supported, mode)
                self.assertEqual(key, 'elevation')
                self.assertTrue(reason)
            # The one that needs nothing is still offered.
            self.assertTrue(udp.available('sockets')[0])


if __name__ == '__main__':
    unittest.main()
