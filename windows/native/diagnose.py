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

try:
    import certchain
except ImportError:  # pragma: no cover - only missing on a broken build
    certchain = None


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


def _offered_chain(secured):
    """The certificates the server sent, DER encoded, leaf first.

    Only Python 3.13 and later can report the ones behind the leaf. On an
    older interpreter the leaf alone is returned, which is enough: Windows
    fetches the rest of the chain itself.
    """
    leaf = secured.getpeercert(binary_form=True)
    try:
        chain = secured.get_unverified_chain()
    except (AttributeError, ValueError, OSError):
        return leaf, ()
    # The DER constant is not part of the public ssl namespace on every
    # version, so it is looked up rather than assumed.
    encoding = getattr(ssl, 'ENCODING_DER', None)
    if encoding is None:
        try:
            import _ssl
            encoding = _ssl.ENCODING_DER
        except (ImportError, AttributeError):
            return leaf, ()
    try:
        rest = tuple(certificate.public_bytes(encoding) for certificate in chain[1:])
    except (AttributeError, TypeError, ValueError):
        rest = ()
    return leaf, rest


def _windows_opinion(family, socktype, proto, sockaddr, host, timeout):
    """Open the connection again and ask Windows about the certificate.

    A second connection is needed because the first socket died with the failed
    handshake. This one does not verify anything itself; it exists only to
    collect what the server presents so Windows can judge it.
    """
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    with socket.socket(family, socktype, proto) as connection:
        connection.settimeout(timeout)
        connection.connect(sockaddr)
        with context.wrap_socket(connection, server_hostname=host) as secured:
            leaf, rest = _offered_chain(secured)
    if not leaf:
        raise OSError('The server sent no certificate')
    return certchain.verify(leaf, host, rest)


def _tls(family, socktype, proto, sockaddr, host, timeout):
    """Verify the certificate, with Windows as the authority when they differ.

    Python is asked first because it is already holding the connection. Its
    refusal is not final: Windows keeps only part of the public root store on
    disk and fetches the rest when something needs one, so a root Python cannot
    see may be perfectly trusted on this machine. Only when Windows refuses as
    well is the certificate reported as bad.
    """
    started = time.monotonic()
    context = ssl.create_default_context()
    try:
        with socket.socket(family, socktype, proto) as connection:
            connection.settimeout(timeout)
            connection.connect(sockaddr)
            with context.wrap_socket(connection, server_hostname=host) as secured:
                return {'ok': True, 'version': secured.version(),
                        'verifiedBy': 'python',
                        'ms': round((time.monotonic() - started) * 1000)}
    except ssl.SSLCertVerificationError as error:
        refusal = str(error)
    except (OSError, ssl.SSLError) as error:
        # Not a trust question: a protocol or transport failure, which Windows
        # would have no more to say about.
        return {'ok': False, 'error': str(error), 'verifiedBy': 'python'}

    if certchain is None or not certchain.available():
        return {'ok': False, 'error': refusal, 'verifiedBy': 'python'}
    try:
        verdict = _windows_opinion(family, socktype, proto, sockaddr, host, timeout)
    except (OSError, ssl.SSLError, ValueError) as error:
        return {'ok': False, 'error': refusal, 'verifiedBy': 'python',
                'chainError': str(error)}
    elapsed = round((time.monotonic() - started) * 1000)
    if verdict['ok']:
        # Windows trusts it and Python does not. The connection is sound; what
        # the difference shows is a root this interpreter cannot see.
        return {'ok': True, 'verifiedBy': 'windows', 'ms': elapsed,
                'rootStoreGap': True, 'pythonError': refusal}
    return {'ok': False, 'verifiedBy': 'windows', 'ms': elapsed,
            'error': verdict['error'], 'errorKey': verdict['errorKey'],
            'pythonError': refusal}


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
        except OSError as error:
            last_error = error
            continue
        if scheme != 'https':
            result['tls'] = {'skipped': True}
            return result
        try:
            ipaddress.ip_address(host)
        except ValueError:
            result['tls'] = _tls(family, socktype, proto, sockaddr, host, timeout)
        else:
            # There is no name to check a certificate against.
            result['tls'] = {'skipped': True}
        return result
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
