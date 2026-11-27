"""Données de la page champion (site/champion.html), servies par /champion_api.

Tout est précalculé par prepare_data.py dans percentiles/data/champion_meta/ (méthode et sources décrites là-bas) :
le serveur ne fait que lire le bon fichier, sans charger le gros fichier lolalytics en mémoire.
"""
import glob
import hashlib
import json
import os
import re
import threading

from stats import BASE

DATA_DIR = os.path.join(BASE, "percentiles", "data")
OUT_DIR = os.path.join(DATA_DIR, "champion_meta")
LANES = ["top", "jungle", "middle", "bottom", "support"]
SOURCES = ("matchup_d2_data.json", "synergie_d2_data.json", "blindability_data.json")

_LOCK = threading.Lock()
_CACHE = {"key": None}


def _nz(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def file_name(champ):
    return _nz(champ) + ".json"


def patch_files():
    out = []
    for f in glob.glob(os.path.join(DATA_DIR, "lolalytics_data_*_emerald_plus_all.json")):
        m = re.search(r"lolalytics_data_([\d.]+)_", os.path.basename(f))
        if m:
            out.append((tuple(int(x) for x in m.group(1).split(".")), m.group(1), f))
    return sorted(out)


def source_hashes():
    """Empreinte des sources présentes (le fichier lolalytics n'est pas déployé : absent sur le serveur)."""
    names = list(SOURCES) + [os.path.basename(f) for _, _, f in patch_files()[-1:]]
    out = {}
    for n in names:
        p = os.path.join(DATA_DIR, n)
        if os.path.isfile(p):
            h = hashlib.md5()
            with open(p, "rb") as f:
                for block in iter(lambda: f.read(1 << 20), b""):
                    h.update(block)
            out[n] = h.hexdigest()
    return out


def _warn_stale(idx):
    now = source_hashes()
    changed = [n for n, h in now.items() if n in idx.get("sources", {}) and idx["sources"][n] != h]
    changed += [n for n in now if n.startswith("lolalytics_") and n not in idx.get("sources", {})]
    if changed:
        print("⚠ données de la page champion périmées (" + ", ".join(changed) + " a changé) : "
              "relance python prepare_data.py", flush=True)


def _index():
    path = os.path.join(OUT_DIR, "index.json")
    if not os.path.isfile(path):
        raise ValueError("données champion absentes : lance python prepare_data.py")
    key = os.path.getmtime(path)
    with _LOCK:
        if _CACHE["key"] != key:
            with open(path, encoding="utf-8") as f:
                idx = json.load(f)
            idx["name_set"] = set(idx["names"])
            _warn_stale(idx)
            _CACHE.update(key=key, idx=idx)
        return _CACHE["idx"]


def _read(rel):
    with open(os.path.join(OUT_DIR, rel), "rb") as f:
        return f.read()


def _resolve(idx, champ):
    # nom lolalytics exact, ou nom / id Data Dragon (« MonkeyKing », « Nunu »…) retrouvé sans ponctuation
    if champ in idx["name_set"]:
        return champ
    k = _nz(champ)
    alias = {"monkeyking": "wukong", "nunu": "nunuwillump", "renata": "renataglasc"}.get(k, k)
    return next((n for n in idx["names"] if _nz(n) in (k, alias)), champ)


# ------------------------------------------------------------------ API (corps JSON prêts à envoyer)
def champion_list_json():
    _index()
    return _read("list.json")


def scaling_json(role):
    """Courbes de scaling du rôle (winrate par durée de partie) : tous les champions + moyenne du rôle."""
    _index()
    if role not in LANES:
        raise ValueError("rôle inconnu : " + str(role))
    return _read(f"scaling_{role}.json")


def champion_json(champ, role):
    idx = _index()
    if role not in LANES:
        raise ValueError("rôle inconnu : " + str(role))
    champ = _resolve(idx, champ)
    roles = idx["roles"].get(champ, [])
    if role not in roles:
        if not roles:
            raise ValueError("champion introuvable : " + champ)
        role = idx["best"][champ]
    return _read(os.path.join(role, file_name(champ)))
