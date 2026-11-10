#!/usr/bin/env python3
"""What a remote endpoint is: which side of the router, which service, where.

The throughput collector already knows the bytes that moved over every TCP
connection, and every connection has a remote address and port. Three of the
breakdowns an operator actually wants - which hosts, which kind of traffic, and
which country - fall out of that same measurement without asking the machine
for anything further. This module is the part that gives those numbers a name.

Each answer carries how it was reached, because they are not equally solid:

  * the LAN/WAN split is read off the address itself and is certain;
  * the service is inferred from the remote port, which is a convention a
    program is free to ignore, so it is labelled as the port's usual service
    rather than as what the bytes actually were;
  * the country comes from the regional registries' own delegation records,
    which say who an address block was handed to, not where the machine
    sits. A block delegated to a company in one country may be announced in
    another. It is the registry's answer, reported as such.
"""
import ipaddress
import os
import socket
import struct
import sys
import threading

# Ports whose usual service is worth naming. A port that is not here is
# reported as its number, not guessed at.
SERVICES = {
    20: 'FTP', 21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP',
    53: 'DNS', 80: 'HTTP', 110: 'POP3', 119: 'NNTP', 123: 'NTP',
    143: 'IMAP', 161: 'SNMP', 194: 'IRC', 389: 'LDAP', 443: 'HTTPS',
    445: 'SMB', 465: 'SMTP', 514: 'Syslog', 546: 'DHCPv6', 547: 'DHCPv6',
    554: 'RTSP', 587: 'SMTP', 636: 'LDAPS', 853: 'DNS over TLS',
    873: 'rsync', 993: 'IMAPS', 995: 'POP3S', 1080: 'SOCKS',
    1194: 'OpenVPN', 1433: 'SQL Server', 1521: 'Oracle', 1723: 'PPTP',
    1883: 'MQTT', 1935: 'RTMP', 3074: 'Xbox Live', 3306: 'MySQL',
    3389: 'Remote Desktop', 3478: 'STUN/TURN', 5060: 'SIP', 5061: 'SIP',
    5222: 'XMPP', 5228: 'Google Services', 5432: 'PostgreSQL',
    5938: 'TeamViewer', 6379: 'Redis', 8080: 'HTTP', 8443: 'HTTPS',
    8883: 'MQTT over TLS', 9000: 'HTTP', 9001: 'Tor', 9418: 'Git',
    27017: 'MongoDB', 51820: 'WireGuard',
}

# Steam and the common game ranges move a lot of bytes and would otherwise all
# read as a bare port number.
RANGES = (
    (27000, 27100, 'Steam'),
    (6881, 6889, 'BitTorrent'),
)


def service_for(port):
    """The service a port is conventionally used for, or None."""
    if port in SERVICES:
        return SERVICES[port]
    for low, high, name in RANGES:
        if low <= port <= high:
            return name
    return None


def scope_for(address):
    """'lan' for anything that never leaves this network, 'wan' otherwise."""
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return 'wan'
    if (parsed.is_private or parsed.is_loopback or parsed.is_link_local
            or parsed.is_multicast or parsed.is_reserved or parsed.is_unspecified):
        return 'lan'
    return 'wan'


class Countries:
    """Address block -> country, from the regional registries' own records.

    The table is built at packaging time (scripts/fetch-geo.js) into a flat
    file of sorted ranges, so a lookup here is a binary search over memory and
    nothing is ever fetched while the application runs. When the file is not
    there the answer is None and the interface says the data is missing rather
    than showing a blank map.
    """

    MAGIC = b'WCGEO1\n'

    def __init__(self, path=None):
        self.path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                         'geo', 'ranges.bin')
        self.loaded = False
        self.error = None
        self.v4_starts = []
        self.v4_rows = []
        self.v6_starts = []
        self.v6_rows = []
        self.generated = None

    def load(self):
        if self.loaded or self.error:
            return self.loaded
        try:
            with open(self.path, 'rb') as handle:
                blob = handle.read()
        except OSError as exc:
            self.error = str(exc)
            return False
        if not blob.startswith(self.MAGIC):
            self.error = 'Unrecognised country table'
            return False
        try:
            head, body = blob[len(self.MAGIC):].split(b'\n', 1)
            generated, count4, count6 = head.decode('ascii').split(' ')
            self.generated = generated
            count4, count6 = int(count4), int(count6)
            # IPv4: start, end as unsigned 32-bit, then a two letter code.
            offset = 0
            for _ in range(count4):
                start, end = struct.unpack_from('<II', body, offset)
                code = body[offset + 8:offset + 10].decode('ascii')
                self.v4_starts.append(start)
                self.v4_rows.append((end, code))
                offset += 10
            # IPv6: start and end as unsigned 64-bit prefixes. A country is
            # never split below a /64, so the top half is enough.
            for _ in range(count6):
                start, end = struct.unpack_from('<QQ', body, offset)
                code = body[offset + 16:offset + 18].decode('ascii')
                self.v6_starts.append(start)
                self.v6_rows.append((end, code))
                offset += 18
        except (ValueError, struct.error) as exc:
            self.error = f'Damaged country table ({exc})'
            self.v4_starts, self.v4_rows = [], []
            self.v6_starts, self.v6_rows = [], []
            return False
        self.loaded = True
        return True

    def status(self):
        self.load()
        if self.loaded:
            return {'supported': True, 'reasonKey': None, 'reason': None,
                    'generated': self.generated,
                    'ranges': len(self.v4_rows) + len(self.v6_rows)}
        return {'supported': False, 'reasonKey': 'missing',
                'reason': self.error or 'No country table in this build'}

    def lookup(self, address):
        if not self.load():
            return None
        import bisect
        try:
            parsed = ipaddress.ip_address(address)
        except ValueError:
            return None
        if parsed.version == 4:
            starts, rows, value = self.v4_starts, self.v4_rows, int(parsed)
        else:
            starts, rows, value = self.v6_starts, self.v6_rows, int(parsed) >> 64
        index = bisect.bisect_right(starts, value) - 1
        if index < 0:
            return None
        end, code = rows[index]
        return code if value <= end else None


class Names:
    """Reverse DNS, looked up off the measurement path.

    A name is a nicety; a stalled sample is not. Lookups run on a small pool of
    background threads and a row simply carries no name until one comes back.
    """

    def __init__(self, workers=4, limit=4096):
        self.cache = {}
        self.pending = set()
        self.lock = threading.Lock()
        self.workers = workers
        self.limit = limit
        self.running = 0

    def get(self, address):
        with self.lock:
            if address in self.cache:
                return self.cache[address]
            if address in self.pending or self.running >= self.workers:
                return None
            if len(self.cache) >= self.limit:
                return None
            self.pending.add(address)
            self.running += 1
        thread = threading.Thread(target=self._resolve, args=(address,), daemon=True)
        thread.start()
        return None

    def _resolve(self, address):
        name = None
        try:
            name = socket.gethostbyaddr(address)[0]
        except (OSError, UnicodeError):
            name = None
        with self.lock:
            # A failure is cached too: the same address must not be asked
            # about again on every single sample.
            self.cache[address] = name
            self.pending.discard(address)
            self.running -= 1


if __name__ == '__main__':
    import json
    table = Countries()
    print(json.dumps(table.status()))
    for argument in sys.argv[1:]:
        print(argument, scope_for(argument), table.lookup(argument))
