#!/usr/bin/env python3
"""Read-only DNS, TCP and TLS connection probe for a user-selected target."""
import argparse
import ipaddress
import json
import socket
import ssl
import sys
import time
from urllib.parse import urlsplit


def parse_target(value):
    value = value.strip()
    if not value or len(value) > 2048 or any(ord(ch) < 32 for ch in value):
        raise ValueError('Invalid target')
    parsed = urlsplit(value if '://' in value else 'https://' + value)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        raise ValueError('Use an HTTP(S) URL, domain or IP address')
    if parsed.username or parsed.password:
        raise ValueError('Credentials are not accepted')
    try:
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    except ValueError as error:
        raise ValueError('Invalid port') from error
    if not 1 <= port <= 65535:
        raise ValueError('Invalid port')
    return parsed.hostname, port, parsed.scheme


def probe(target, timeout=2.5):
    host, port, scheme = parse_target(target)
    result = {'target': target, 'host': host, 'port': port, 'dns': None,
              'tcp': None, 'tls': None}
    started = time.monotonic()
    try:
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        ips = list(dict.fromkeys(item[4][0] for item in addresses))
        result['dns'] = {'ok': True, 'addresses': ips,
                         'ms': round((time.monotonic() - started) * 1000)}
    except (OSError, UnicodeError) as error:
        result['dns'] = {'ok': False, 'error': str(error)}
        return result
    last_error = None
    for family, socktype, proto, _canon, sockaddr in addresses[:6]:
        started = time.monotonic()
        try:
            with socket.socket(family, socktype, proto) as connection:
                connection.settimeout(timeout)
                connection.connect(sockaddr)
                result['tcp'] = {'ok': True, 'address': sockaddr[0],
                                 'ms': round((time.monotonic() - started) * 1000)}
                if scheme != 'https':
                    result['tls'] = {'skipped': True}
                else:
                    try:
                        ipaddress.ip_address(host)
                        result['tls'] = {'skipped': True}
                    except ValueError:
                        started = time.monotonic()
                        try:
                            context = ssl.create_default_context()
                            with context.wrap_socket(connection, server_hostname=host) as secured:
                                result['tls'] = {'ok': True, 'version': secured.version(),
                                                 'ms': round((time.monotonic() - started) * 1000)}
                        except (OSError, ssl.SSLError) as error:
                            result['tls'] = {'ok': False, 'error': str(error)}
                return result
        except OSError as error:
            last_error = error
    result['tcp'] = {'ok': False, 'error': str(last_error) if last_error else 'Connection failed'}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('target')
    args = parser.parse_args()
    try:
        print(json.dumps(probe(args.target)))
        return 0
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
