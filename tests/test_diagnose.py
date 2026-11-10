import socket
import threading
import unittest

from diagnose import parse_target, probe


class DiagnoseTests(unittest.TestCase):
    def test_target_validation(self):
        self.assertEqual(parse_target('https://example.com/path'), ('example.com', 443, 'https'))
        self.assertEqual(parse_target('example.com:8443'), ('example.com', 8443, 'https'))
        with self.assertRaises(ValueError):
            parse_target('file:///etc/passwd')
        with self.assertRaises(ValueError):
            parse_target('https://user:secret@example.com')

    def test_loopback_tcp_probe(self):
        listener = socket.socket()
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        port = listener.getsockname()[1]
        thread = threading.Thread(target=lambda: listener.accept()[0].close(), daemon=True)
        thread.start()
        try:
            result = probe(f'127.0.0.1:{port}')
            self.assertTrue(result['dns']['ok'])
            self.assertTrue(result['tcp']['ok'])
            self.assertTrue(result['tls']['skipped'])
        finally:
            thread.join(timeout=1)
            listener.close()


if __name__ == '__main__':
    unittest.main()
