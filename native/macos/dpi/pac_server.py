"""Loopback-only PAC endpoint for the temporary Chrome site adapter."""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RULES = Path(sys.argv[1])


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not self.path.startswith('/proxy.pac'):
            self.send_error(404)
            return
        try:
            domains = json.loads(RULES.read_text(encoding='utf-8'))
            if not isinstance(domains, list):
                domains = []
        except (OSError, ValueError):
            domains = []
        clauses = [
            f'(host === {json.dumps(domain)} || dnsDomainIs(host, {json.dumps("." + domain)}))'
            for domain in domains if isinstance(domain, str)
        ]
        condition = ' || '.join(clauses) or 'false'
        body = (
            'function FindProxyForURL(url, host) {\n'
            '  host = host.toLowerCase();\n'
            f'  if ({condition}) return "PROXY 127.0.0.1:18089";\n'
            '  return "DIRECT";\n'
            '}\n'
        ).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ns-proxy-autoconfig')
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        pass


ThreadingHTTPServer(('127.0.0.1', 18090), Handler).serve_forever()
