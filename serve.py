#!/usr/bin/env python3
"""Serveur WSGI (Gunicorn) et local sur http://localhost:8000.

Cache HTTP : chaque réponse porte un ETag (le navigateur revalide et reçoit un 304 si rien n'a changé), le texte est
compressé en gzip, et les pages HTML appellent app.js / style.css avec ?v=<version du fichier> : un fichier modifié
change d'URL, le navigateur le recharge aussitôt, sinon il le garde en cache. Rien à faire à la main après une modif.
"""
import gzip
import hashlib
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
    """GET /pool_advice_api?p=<joueur>&r=<ROLE>&ban=A,B[&lock=C,D][&bm=matchups|matchups_synergies] : recalcule le top des pools conseillés avec ces bans / locks."""
    from urllib.parse import parse_qs
    import pool_advice
    q = parse_qs(query or "", keep_blank_values=True)
    player, role = q.get("p", [""])[0], q.get("r", [""])[0]
    bans = [b for b in q.get("ban", [""])[0].split(",") if b.strip()]
    # lock absent = obligatoires automatiques ; lock présent (même vide) = liste explicite
    locks = [b for b in q["lock"][0].split(",") if b.strip()] if "lock" in q else None
    try:
        body = pool_advice.advise_pair(player, role, bans, locks, q.get("bm", [None])[0])
        return "200 OK", json.dumps(body, ensure_ascii=False).encode("utf-8")
    except Exception as e:
        return "400 Bad Request", json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8")


def _champion_api(query):
    """GET /champion_api?c=<champion>&r=<lane> : données de la page champion ; sans c : liste des champions par rôle ;
    ?scaling=<lane> : winrate par durée de partie de tous les champions du rôle."""
    from urllib.parse import parse_qs
    import champion_meta
    q = parse_qs(query or "")
    champ, role, sc = q.get("c", [""])[0], q.get("r", [""])[0], q.get("scaling", [""])[0]
    try:
        # fichiers précalculés par prepare_data.py : renvoyés tels quels
        return "200 OK", (champion_meta.scaling_json(sc) if sc else
                          champion_meta.champion_json(champ, role or "top") if champ else
                          champion_meta.champion_list_json())
    except Exception as e:
        return "400 Bad Request", json.dumps({"error": str(e)}, ensure_ascii=False).encode("utf-8")


API = {"/pool_advice_api": _advice_api, "/champion_api": _champion_api}


# ------------------------------------------------------------------ cache HTTP / gzip
VERSIONED = ("app.js", "style.css")    # appelés avec ?v=<version> depuis les pages HTML
_GZ = {}                               # chemin -> (clé de version, octets gzip)
_GZ_LOCK = threading.Lock()


def _compressible(ctype):
    return ctype.startswith("text/") or ctype.split(";")[0] in ("application/javascript", "application/json",
                                                                "image/svg+xml")


def _file_version(full):
    st = os.stat(full)
    return f"{st.st_mtime_ns:x}-{st.st_size:x}"


def _html_with_versions(body):
    # app.js / style.css -> app.js?v=… : l'URL change dès que le fichier change
    for name in VERSIONED:
        p = os.path.join(SITE, name)
        if os.path.isfile(p):
            v = hashlib.md5(_file_version(p).encode()).hexdigest()[:10]
            body = body.replace(f'"{name}"'.encode(), f'"{name}?v={v}"'.encode())
    return body


def _respond(environ, start_response, body, ctype, cache, etag=None, gz_key=None):
    """Envoie body avec ETag, 304 si le navigateur a déjà cette version, gzip s'il l'accepte.
    gz_key : (chemin, version) pour garder la version gzip d'un fichier statique au lieu de la recompresser."""
    if etag is None:
        etag = 'W/"' + hashlib.md5(body).hexdigest()[:16] + '"'
    headers = [("Content-Type", ctype), ("Cache-Control", cache), ("ETag", etag), ("Vary", "Accept-Encoding")]
    inm = environ.get("HTTP_IF_NONE_MATCH", "")
    if inm and etag in [t.strip() for t in inm.split(",")]:
        start_response("304 Not Modified", headers)
        return []
    if len(body) > 1024 and _compressible(ctype) and "gzip" in environ.get("HTTP_ACCEPT_ENCODING", ""):
        if gz_key:
            with _GZ_LOCK:
                hit = _GZ.get(gz_key[0])
            if hit and hit[0] == gz_key[1]:
                body = hit[1]
            else:
                body = gzip.compress(body, 6)
                with _GZ_LOCK:
                    _GZ[gz_key[0]] = (gz_key[1], body)
        else:
            body = gzip.compress(body, 6)
        headers.append(("Content-Encoding", "gzip"))
    headers.append(("Content-Length", str(len(body))))
    start_response("200 OK", headers)
    return [] if environ.get("REQUEST_METHOD", "GET").upper() == "HEAD" else [body]


def _static_response(environ, start_response):
    path_info = environ.get("PATH_INFO", "/")
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

    name = os.path.basename(full)
    if ctype.startswith("text/html"):
        # la page dépend aussi des versions de app.js / style.css : ETag calculé sur le contenu réécrit
        body = _html_with_versions(body)
        return _respond(environ, start_response, body, ctype, "no-cache")
    version = _file_version(full)
    if name in VERSIONED and "v=" in environ.get("QUERY_STRING", ""):
        cache = "public, max-age=31536000, immutable"   # nouvelle version = nouvelle URL
    elif ctype.startswith("image/"):
        cache = "public, max-age=86400"
    else:
        cache = "no-cache"                               # revalidé à chaque fois (304 si inchangé)
    return _respond(environ, start_response, body, ctype, cache, etag=f'W/"{version}"', gz_key=(full, version))


JSON = "application/json; charset=utf-8"


def app(environ, start_response):
    """Point d'entrée WSGI pour Gunicorn (`gunicorn serve:app`, réglages dans gunicorn.conf.py)."""
    method = environ.get("REQUEST_METHOD", "GET").upper()
    if method not in ("GET", "HEAD"):
        start_response("405 Method Not Allowed", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Method Not Allowed"]

    path_info = environ.get("PATH_INFO", "/")

    if path_info == "/data.json":
        importlib.reload(stats)
        payload = json.dumps(stats.build(), ensure_ascii=False).encode("utf-8")
        return _respond(environ, start_response, payload, JSON, "no-cache")

    if path_info in API:
        status, payload = API[path_info](environ.get("QUERY_STRING", ""))
        if not status.startswith("200"):
            start_response(status, [("Content-Type", JSON), ("Content-Length", str(len(payload))),
                                    ("Cache-Control", "no-store")])
            return [] if method == "HEAD" else [payload]
        return _respond(environ, start_response, payload, JSON, "no-cache")

    return _static_response(environ, start_response)


if __name__ == "__main__":
    # serveur local : la même application WSGI que sur Render, servie par wsgiref (un thread par requête)
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIServer, make_server

    class ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
        daemon_threads = True

    if "--update" in sys.argv:
        threading.Thread(target=background_update, daemon=True).start()

    port = int(os.environ.get("PORT", "8000"))
    print(f"Site : http://localhost:{port}  (Ctrl+C pour arrêter)")
    make_server("127.0.0.1", port, app, server_class=ThreadingWSGIServer).serve_forever()
