#!/usr/bin/env python3
"""Verify a server certificate the way Windows itself would.

Why this exists. Python carries its own copy of the trusted roots and, on
Windows, reads them from the certificate store as it stands right now. Windows
does not keep every public root installed: it ships a small set and fetches the
rest from Microsoft's update service the first time something needs one. A root
that no program on this machine has needed yet is therefore simply absent, and
Python reports the certificate as untrusted while Edge opens the same site
without a word.

For this application that is not a cosmetic difference. Wirecove's whole point
is to tell the user whether something is interfering with their connection. If
a stale root store and an operator sitting in the middle produce the same red
line, the line means nothing. So when Python's own verification fails, the
chain is handed to Windows, which builds it the way the rest of the system
does - fetching whatever root or intermediate it is missing - and its answer is
reported as the authority, with Python's objection kept beside it.

Nothing here is changed or installed: CertGetCertificateChain only reads and
caches, exactly as a browser on this machine does.
"""
import ctypes
import ctypes.wintypes
import sys

DWORD = ctypes.wintypes.DWORD
LPWSTR = ctypes.wintypes.LPWSTR

X509_ASN_ENCODING = 0x00000001
PKCS_7_ASN_ENCODING = 0x00010000
ENCODING = X509_ASN_ENCODING | PKCS_7_ASN_ENCODING

CERT_STORE_PROV_MEMORY = 2
CERT_STORE_CREATE_NEW_FLAG = 0x00002000
CERT_STORE_ADD_ALWAYS = 4

USAGE_MATCH_TYPE_AND = 0
SERVER_AUTH_OID = b'1.3.6.1.5.5.7.3.1'

CERT_CHAIN_POLICY_SSL = 4
AUTHTYPE_SERVER = 2

# The failures worth naming. Anything else is reported by its code, because a
# wrong explanation is worse than an honest number.
CHAIN_ERRORS = {
    0x800B0101: ('expired', 'The certificate has expired or is not yet valid'),
    0x800B0109: ('untrusted-root', 'The chain ends in a root Windows does not trust'),
    0x800B010A: ('incomplete-chain', 'Windows could not build a chain to a trusted root'),
    0x800B010C: ('revoked', 'The certificate has been revoked'),
    0x800B010F: ('name-mismatch', 'The certificate was not issued for this host name'),
    0x800B0110: ('wrong-usage', 'The certificate is not valid for server authentication'),
    0x800B0112: ('explicit-distrust', 'The certificate is explicitly distrusted on this machine'),
}


class CERT_ENHKEY_USAGE(ctypes.Structure):
    _fields_ = [('cUsageIdentifier', DWORD),
                ('rgpszUsageIdentifier', ctypes.POINTER(ctypes.c_char_p))]


class CERT_USAGE_MATCH(ctypes.Structure):
    _fields_ = [('dwType', DWORD), ('Usage', CERT_ENHKEY_USAGE)]


class CERT_CHAIN_PARA(ctypes.Structure):
    """Only the fields up to RequestedUsage are set; cbSize says so, which is
    how this structure has always been versioned."""
    _fields_ = [('cbSize', DWORD), ('RequestedUsage', CERT_USAGE_MATCH)]


class CERT_CHAIN_POLICY_PARA(ctypes.Structure):
    _fields_ = [('cbSize', DWORD), ('dwFlags', DWORD),
                ('pvExtraPolicyPara', ctypes.c_void_p)]


class CERT_CHAIN_POLICY_STATUS(ctypes.Structure):
    _fields_ = [('cbSize', DWORD), ('dwError', DWORD),
                ('lChainIndex', ctypes.c_long), ('lElementIndex', ctypes.c_long),
                ('pvExtraPolicyStatus', ctypes.c_void_p)]


class SSL_EXTRA_CERT_CHAIN_POLICY_PARA(ctypes.Structure):
    _fields_ = [('cbStruct', DWORD), ('dwAuthType', DWORD),
                ('fdwChecks', DWORD), ('pwszServerName', LPWSTR)]


def available():
    return sys.platform == 'win32'


def _crypt32():
    library = ctypes.WinDLL('crypt32', use_last_error=True)
    library.CertCreateCertificateContext.restype = ctypes.c_void_p
    library.CertCreateCertificateContext.argtypes = [DWORD, ctypes.c_char_p, DWORD]
    library.CertOpenStore.restype = ctypes.c_void_p
    library.CertOpenStore.argtypes = [ctypes.c_void_p, DWORD, ctypes.c_void_p,
                                      DWORD, ctypes.c_void_p]
    library.CertAddEncodedCertificateToStore.restype = ctypes.c_int
    library.CertAddEncodedCertificateToStore.argtypes = [
        ctypes.c_void_p, DWORD, ctypes.c_char_p, DWORD, DWORD, ctypes.c_void_p]
    library.CertGetCertificateChain.restype = ctypes.c_int
    library.CertGetCertificateChain.argtypes = [
        ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
        ctypes.POINTER(CERT_CHAIN_PARA), DWORD, ctypes.c_void_p,
        ctypes.POINTER(ctypes.c_void_p)]
    library.CertVerifyCertificateChainPolicy.restype = ctypes.c_int
    library.CertVerifyCertificateChainPolicy.argtypes = [
        ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(CERT_CHAIN_POLICY_PARA),
        ctypes.POINTER(CERT_CHAIN_POLICY_STATUS)]
    library.CertFreeCertificateChain.argtypes = [ctypes.c_void_p]
    library.CertFreeCertificateContext.argtypes = [ctypes.c_void_p]
    library.CertCloseStore.argtypes = [ctypes.c_void_p, DWORD]
    return library


def verify(leaf_der, host, extra_der=()):
    """Ask Windows whether this certificate is valid for this host name.

    `leaf_der` is the server's own certificate; `extra_der` are any further
    certificates the server offered. Windows fetches whatever else the chain
    needs, which is the entire point of asking it.

    Returns a dict: {'ok': bool, 'errorKey': str|None, 'error': str|None,
    'code': int}. A result it could not reach at all raises OSError, so a
    caller can tell "Windows says no" from "Windows could not be asked".
    """
    if not available():
        raise OSError('Windows certificate chains are only available on Windows')
    if not isinstance(leaf_der, (bytes, bytearray)) or not leaf_der:
        raise ValueError('A DER certificate is required')

    library = _crypt32()
    context = library.CertCreateCertificateContext(ENCODING, bytes(leaf_der), len(leaf_der))
    if not context:
        raise OSError(f'CertCreateCertificateContext failed ({ctypes.get_last_error()})')

    store = None
    chain = ctypes.c_void_p()
    try:
        # The certificates the server sent along are offered to the builder as
        # an extra store. They are candidates, not trust: Windows still has to
        # reach a root of its own through them.
        if extra_der:
            store = library.CertOpenStore(ctypes.c_void_p(CERT_STORE_PROV_MEMORY), ENCODING,
                                          None, CERT_STORE_CREATE_NEW_FLAG, None)
            for der in extra_der:
                if der:
                    library.CertAddEncodedCertificateToStore(
                        store, ENCODING, bytes(der), len(der), CERT_STORE_ADD_ALWAYS, None)

        oid = ctypes.c_char_p(SERVER_AUTH_OID)
        usage = CERT_ENHKEY_USAGE(1, ctypes.pointer(oid))
        parameters = CERT_CHAIN_PARA(ctypes.sizeof(CERT_CHAIN_PARA),
                                     CERT_USAGE_MATCH(USAGE_MATCH_TYPE_AND, usage))
        # Revocation is deliberately not requested: Python's own verification
        # does not check it either, so asking for it here would turn an
        # unreachable OCSP responder into a difference between the two answers
        # rather than a fact about the connection.
        built = library.CertGetCertificateChain(None, ctypes.c_void_p(context), None, store,
                                                ctypes.byref(parameters), 0, None,
                                                ctypes.byref(chain))
        if not built or not chain:
            raise OSError(f'CertGetCertificateChain failed ({ctypes.get_last_error()})')

        extra = SSL_EXTRA_CERT_CHAIN_POLICY_PARA(
            ctypes.sizeof(SSL_EXTRA_CERT_CHAIN_POLICY_PARA), AUTHTYPE_SERVER, 0,
            ctypes.c_wchar_p(host) if host else None)
        policy = CERT_CHAIN_POLICY_PARA(ctypes.sizeof(CERT_CHAIN_POLICY_PARA), 0,
                                        ctypes.cast(ctypes.byref(extra), ctypes.c_void_p))
        status = CERT_CHAIN_POLICY_STATUS()
        status.cbSize = ctypes.sizeof(CERT_CHAIN_POLICY_STATUS)
        checked = library.CertVerifyCertificateChainPolicy(
            ctypes.c_void_p(CERT_CHAIN_POLICY_SSL), chain,
            ctypes.byref(policy), ctypes.byref(status))
        if not checked:
            raise OSError(f'CertVerifyCertificateChainPolicy failed ({ctypes.get_last_error()})')

        code = status.dwError & 0xFFFFFFFF
        if code == 0:
            return {'ok': True, 'errorKey': None, 'error': None, 'code': 0}
        key, message = CHAIN_ERRORS.get(code, ('refused', f'Windows refused the chain (0x{code:08X})'))
        return {'ok': False, 'errorKey': key, 'error': message, 'code': code}
    finally:
        if chain:
            library.CertFreeCertificateChain(chain)
        if store:
            library.CertCloseStore(store, 0)
        library.CertFreeCertificateContext(ctypes.c_void_p(context))
