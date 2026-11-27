#!/usr/bin/env python3
"""Serveur WSGI (Gunicorn) et local sur http://localhost:8000."""
import importlib
import json
import mimetypes
import os
import sys
import threading
import stats
from stats import BASE

SITE = os.path.join(BASE, "site")
# fichiers servis hors de site/ (chemin public -> fichier local)
EXTRA = {"/blindability.json": os.path.join(BASE, "percentiles", "data", "blindability_data.json"),
         "/pool_advice.json": os.path.join(BASE, "percentiles", "data", "pool_advice.json")}


def background_update():
    """Met à jour le cache SoloQ / Flex (ranked.py) en arrière-plan."""
    try:
        import download as dl
        import ranked

        dl.KEY = dl.get_key(None)
        for label in [t[0] for t in stats.tracked()]:
            for _, q in stats.RANKED_QUEUES:
                ranked.update(label, q, "europe", stats.season_start_ms() / 1000, 0)
        print("Mise à jour SoloQ / Flex terminée : recharge la page.")
    except SystemExit as e:
        print("Mise à jour interrompue :", e)
    except Exception as e:
        print("Mise à jour en erreur :", repr(e))


def _advice_api(query):
    """GET /pool_advice_api?p=<joueur>&r=<ROLE>&ban=A,B[&lock=C,D] : recalcule le top des pools conseillés avec ces bans / locks."""
    from urllib.parse import parse_qs
    import pool_advice
    q = parse_qs(query or "", keep_blank_values=True)
    player, role = q.get("p", [""])[0], q.get("r", [""])[0]
    bans = [b for b in q.get("ban", [""])[0].split(",") if b.strip()]
    # lock absent = obligatoires automatiques ; lock présent (même vide) = liste explicite
    locks = [b for b in q["lock"][0].split(",") if b.strip()] if "lock" in q else None
    try:
        body = pool_advice.advise_pair(player, role, bans, locks)
        return "200 OK", json.dumps(body, ensure_ascii=False).encode("utf-8")
    except Exception as e:
        return "400 Bad Request", json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8")


def _champion_api(query):
    """GET /champion_api?c=<champion>&r=<lane> : données de la page champion ; sans c : liste des champions par rôle."""
    from urllib.parse import parse_qs
    import champion_meta
    q = parse_qs(query or "")
    champ, role = q.get("c", [""])[0], q.get("r", [""])[0]
    try:
        body = champion_meta.champion(champ, role or "top") if champ else champion_meta.champion_list()
        return "200 OK", json.dumps(body, ensure_ascii=False).encode("utf-8")
    except Exception as e:
        return "400 Bad Request", json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8")


API = {"/pool_advice_api": _advice_api, "/champion_api": _champion_api}


def _static_response(path_info, start_response):
    rel = path_info.lstrip("/") or "index.html"
    root = os.path.realpath(SITE)
    full = os.path.realpath(os.path.join(root, rel))
    if path_info in EXTRA and not os.path.isfile(full):
        root = full = os.path.realpath(EXTRA[path_info])

    if os.path.commonpath([root, full]) != root:
        start_response("403 Forbidden", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Forbidden"]

    if os.path.isdir(full):
        full = os.path.join(full, "index.html")

    if not os.path.isfile(full):
        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Not Found"]

    ctype, _ = mimetypes.guess_type(full)
    if not ctype:
        ctype = "application/octet-stream"
    if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
        ctype += "; charset=utf-8"

    with open(full, "rb") as f:
        body = f.read()

    headers = [
        ("Content-Type", ctype),
        ("Content-Length", str(len(body))),
        ("Cache-Control", "no-store"),
    ]
    start_response("200 OK", headers)
    return [body]


def app(environ, start_response):
    """Point d'entrée WSGI pour Gunicorn (`gunicorn serve:app`)."""
    method = environ.get("REQUEST_METHOD", "GET").upper()
    if method not in ("GET", "HEAD"):
        start_response("405 Method Not Allowed", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Method Not Allowed"]

    path_info = environ.get("PATH_INFO", "/")

    if path_info == "/data.json":
        importlib.reload(stats)
        payload = json.dumps(stats.build(), ensure_ascii=False).encode("utf-8")
        headers = [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Content-Length", str(len(payload))),
            ("Cache-Control", "no-store"),
        ]
        start_response("200 OK", headers)
        return [] if method == "HEAD" else [payload]

    if path_info in API:
        status, payload = API[path_info](environ.get("QUERY_STRING", ""))
        start_response(status, [("Content-Type", "application/json; charset=utf-8"),
                                ("Content-Length", str(len(payload))), ("Cache-Control", "no-store")])
        return [] if method == "HEAD" else [payload]

    body = _static_response(path_info, start_response)
    return [] if method == "HEAD" else body


if __name__ == "__main__":
    import http.server

    if "--update" in sys.argv:
        threading.Thread(target=background_update, daemon=True).start()

    class H(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def __init__(self, *a, **k):
            super().__init__(*a, directory=SITE, **k)

        def do_GET(self):
            if self.path.split("?")[0] == "/data.json":
                importlib.reload(stats)
                b = json.dumps(stats.build(), ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
            elif self.path.split("?")[0] in API:
                status, b = API[self.path.split("?")[0]](self.path.partition("?")[2])
                self.send_response(int(status.split()[0]))
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
            elif self.path.split("?")[0] in EXTRA and os.path.isfile(EXTRA[self.path.split("?")[0]]):
                with open(EXTRA[self.path.split("?")[0]], "rb") as f:
                    b = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
            else:
                super().do_GET()

    port = int(os.environ.get("PORT", "8000"))
    print(f"Site : http://localhost:{port}  (Ctrl+C pour arrêter)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()