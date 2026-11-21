import os
from flask import Flask, send_from_directory, abort, Response
import json
import stats

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.join(BASE_DIR, "site")

app = Flask(__name__, static_folder=None)

# Cache : on calcule une fois, puis on réutilise tant que games/ n'a pas changé
_cache = {"sig": None, "body": None}

def games_signature():
    d = os.path.join(BASE_DIR, "games")
    if not os.path.isdir(d):
        return 0
    return tuple(sorted((f, os.path.getmtime(os.path.join(d, f))) for f in os.listdir(d) if f.endswith(".json")))

@app.route("/data.json")
def data():
    sig = games_signature()
    if _cache["sig"] != sig or _cache["body"] is None:
        _cache["body"] = json.dumps(stats.build(), ensure_ascii=False)
        _cache["sig"] = sig
    return Response(_cache["body"], mimetype="application/json")

@app.route("/")
def index():
    return send_from_directory(SITE_DIR, "index.html")

@app.route("/<path:path>")
def static_files(path):
    if os.path.isfile(os.path.join(SITE_DIR, path)):
        return send_from_directory(SITE_DIR, path)
    abort(404)

if __name__ == "__main__":
    print("Site : http://localhost:8000  (Ctrl+C pour arrêter)")
    app.run(host="127.0.0.1", port=8000)