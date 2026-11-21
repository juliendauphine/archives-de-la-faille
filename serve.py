#!/usr/bin/env python3
"""Lance le site sur http://localhost:8000 (les stats sont recalculées à chaque rechargement)."""
import http.server, importlib, json, os
import stats
from stats import BASE

SITE = os.path.join(BASE, "site")

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=SITE, **k)
    def do_GET(self):
        if self.path.split("?")[0] == "/data.json":
            importlib.reload(stats)  # prend en compte les modifs de stats.py sans redémarrer
            b = json.dumps(stats.build(), ensure_ascii=False).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        else:
            super().do_GET()

if __name__ == "__main__":
    print("Site : http://localhost:8000  (Ctrl+C pour arrêter)")
    http.server.ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()
