#!/usr/bin/env python3
"""Lance le site sur http://localhost:8000 (les stats sont recalculées à chaque rechargement)."""
import http.server, importlib, json, os, sys, threading
import stats
from stats import BASE

SITE = os.path.join(BASE, "site")

def background_update():
    """python serve.py --update : met à jour le cache SoloQ / Flex (ranked.py) pendant que le site tourne."""
    try:
        import download as dl, ranked
        dl.KEY = dl.get_key(None)
        for label in [t[0] for t in stats.tracked()]:
            for _, q in stats.RANKED_QUEUES:
                ranked.update(label, q, "europe", stats.season_start_ms() / 1000, 0)
        print("Mise à jour SoloQ / Flex terminée : recharge la page.")
    except SystemExit as e:
        print("Mise à jour interrompue :", e)
    except Exception as e:
        print("Mise à jour en erreur :", repr(e))


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # toujours la dernière version des fichiers
        super().end_headers()

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
    if "--update" in sys.argv:
        threading.Thread(target=background_update, daemon=True).start()
    print("Site : http://localhost:8000  (Ctrl+C pour arrêter)")
    http.server.ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()