"""Private hosted maintenance process: disk mounted, no application writers.

Temporarily replace workbench.serve with this entry point during a coordinated
backup. It deliberately imports no application setup, database or provider code.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import os


class Handler(BaseHTTPRequestHandler):
    def respond(self):
        healthy = self.command in {'GET', 'HEAD'} and self.path == '/health'
        payload = b'{"status":"maintenance"}'
        self.send_response(200 if healthy else 503)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(payload)

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = respond

    def log_message(self, *_):
        pass


def main():
    with HTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8000'))), Handler) as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
