"""Données de la page champion (site/champion.html), servies par /champion_api.

Sources (percentiles/data) :
  - lolalytics_data_<patch>_emerald_plus_all.json : le patch le plus récent présent (winrate, pick / ban rate,
    winrates des matchups / synergies du patch). Remplacer ou ajouter un fichier suffit : le cache se recharge seul.
  - matchup_d2_data.json / synergie_d2_data.json : Δ2 multi-patchs (notebooks matchups_clean / synergies_clean, bias_d2).
  - blindability_data.json : probabilité d'être contré (notebook blindability_roles).

True winrate = winrate brut − biais de sélection de chaque rôle (matchups des 5 rôles adverses + synergies des 4 alliés),
biais = brut − winrate repondéré par les pick rates du patch (même calcul que get_true_winrate_per_patch / bias_d2.py).
"""
import glob
import json
import os
import re
import threading

from stats import BASE

DATA_DIR = os.path.join(BASE, "percentiles", "data")
LANES = ["top", "jungle", "middle", "bottom", "support"]
MIN_PLAYRATE = 0.2          # champions pris en compte dans la repondération (comme matchups_clean.ipynb)

_LOCK = threading.Lock()
_CACHE = {"key": None}


def _nz(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _patch_files():
    out = []
    for f in glob.glob(os.path.join(DATA_DIR, "lolalytics_data_*_emerald_plus_all.json")):
        m = re.search(r"lolalytics_data_([\d.]+)_", os.path.basename(f))
        if m:
            out.append((tuple(int(x) for x in m.group(1).split(".")), m.group(1), f))
    return sorted(out)


def _load_json(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ------------------------------------------------------------------ biais de sélection / true winrate
def _lane_bias(champ_data, unadj, kind, lane2, accepted, patch_lane2, champ):
    pairs = champ_data.get(kind, {}).get(lane2, {})
    adj = tot = 0.0
    for other in accepted:
        if other == champ or other not in pairs or other not in patch_lane2:
            continue
        pr = patch_lane2[other]["Pick_rate"]
        adj += float(pairs[other]["win_rate"]) * pr
        tot += pr
    return unadj - adj / tot if tot > 0 else 0.0


def _biases(patch):
    accepted = {l: [c for c, v in patch[l].items() if v.get("Pick_rate", 0) > MIN_PLAYRATE] for l in LANES}
    out = {}
    for lane in LANES:
        out[lane] = {}
        for champ, cd in patch[lane].items():
            unadj = cd["Win_perc"]
            m = {l2: _lane_bias(cd, unadj, "Matchups", l2, accepted[l2], patch[l2], champ) for l2 in LANES}
            s = {l2: _lane_bias(cd, unadj, "Synergies", l2, accepted[l2], patch[l2], champ) for l2 in LANES if l2 != lane}
            out[lane][champ] = {"true": unadj - sum(m.values()) - sum(s.values()), "matchups": m, "synergies": s}
    return out


def _role_wr_length(lane_data):
    # winrate moyen du rôle par durée de partie, pondéré par le nombre de parties de chaque champion
    acc = {}
    for v in lane_data.values():
        g = v.get("Games") or 0
        for b in v.get("WR_vs_length") or []:
            s = acc.setdefault(b["game_length"], [0.0, 0])
            s[0] += b["winrate"] * g
            s[1] += g
    return [{"game_length": k, "winrate": round(s[0] / s[1], 2)} for k, s in acc.items() if s[1]]


# ------------------------------------------------------------------ cache (rechargé quand un fichier change)
def _state():
    files = _patch_files()
    deps = [f for _, _, f in files[-1:]] + [os.path.join(DATA_DIR, n) for n in
                                            ("matchup_d2_data.json", "synergie_d2_data.json", "blindability_data.json")]
    key = tuple((f, os.path.getmtime(f)) for f in deps if os.path.isfile(f))
    with _LOCK:
        if _CACHE["key"] != key:
            patch = name = None
            if files:
                _, name, path = files[-1]
                with open(path, encoding="utf-8") as f:
                    patch = json.load(f)
            _CACHE.update(key=key, patch=patch, patch_name=name, biases=_biases(patch) if patch else None,
                          md2=_load_json("matchup_d2_data.json") or {}, sd2=_load_json("synergie_d2_data.json") or {},
                          blind=_load_json("blindability_data.json"))
        return _CACHE


def _resolve(st, champ):
    # nom lolalytics exact, ou nom / id Data Dragon (« MonkeyKing », « Nunu »…) retrouvé sans ponctuation
    names = set()
    for src in (st["md2"], st["patch"] or {}):
        for l in LANES:
            names.update(src.get(l, {}).keys())
    if champ in names:
        return champ
    k = _nz(champ)
    alias = {"monkeyking": "wukong", "nunu": "nunuwillump", "renata": "renataglasc"}.get(k, k)
    return next((n for n in names if _nz(n) in (k, alias)), champ)


# ------------------------------------------------------------------ API
def champion_list():
    st = _state()
    patch = st["patch"] or {}
    roles = {}
    for l in LANES:
        names = set(st["md2"].get(l, {})) | set(patch.get(l, {}))
        rows = []
        for c in names:
            p = patch.get(l, {}).get(c)
            if not p and c not in st["md2"].get(l, {}):
                continue
            rows.append({"c": c, "pr": p["Pick_rate"] if p else None, "wr": p["Win_perc"] if p else None,
                         "d2": c in st["md2"].get(l, {})})
        roles[l] = sorted(rows, key=lambda r: -(r["pr"] or 0))
    return {"patch": st["patch_name"], "roles": roles}


def scaling(role):
    """Courbes de scaling du rôle (winrate par durée de partie) : tous les champions + moyenne du rôle."""
    st = _state()
    if role not in LANES:
        raise ValueError("rôle inconnu : " + str(role))
    lane = (st["patch"] or {}).get(role, {})
    return {"patch": st["patch_name"], "role": _role_wr_length(lane),
            "champs": {c: v["WR_vs_length"] for c, v in lane.items() if v.get("WR_vs_length")}}


def champion(champ, role):
    st = _state()
    if role not in LANES:
        raise ValueError("rôle inconnu : " + str(role))
    champ = _resolve(st, champ)
    patch = st["patch"] or {}
    roles = [l for l in LANES if champ in st["md2"].get(l, {}) or champ in patch.get(l, {})]
    if role not in roles:
        if not roles:
            raise ValueError("champion introuvable : " + champ)
        role = max(roles, key=lambda l: patch.get(l, {}).get(champ, {}).get("Pick_rate", 0))

    p = patch.get(role, {}).get(champ)
    info = None
    if p:
        b = st["biases"][role][champ]
        info = {"patch": st["patch_name"], "games": p.get("Games"), "wr": p.get("Win_perc"), "pr": p.get("Pick_rate"),
                "br": p.get("Ban_rate"), "note": p.get("Note"), "role_rank": p.get("Role_rank"),
                "lane_pct": p.get("Lane_perc"), "tier_wr": patch["patch_infos"].get("tier_win_rate"),
                "true_wr": round(b["true"], 3),
                "bias": {"matchups": {k: round(v, 3) for k, v in b["matchups"].items()},
                         "synergies": {k: round(v, 3) for k, v in b["synergies"].items()}},
                "wr_length": p.get("WR_vs_length"),
                # [valeur, rang dans le rôle] ; rang 1 = valeur la plus élevée du rôle
                "raw_stats": p.get("Raw_stats"),
                "raw_n": sum(1 for v in patch[role].values() if v.get("Raw_stats")),
                "playerbase": p.get("Playerbase"),
                # tous les champions du rôle : [nom, breadth, depth, pick rate] (1 = moyenne)
                "role_playerbase": [[c, v["Playerbase"]["breadth"], v["Playerbase"]["depth"], v.get("Pick_rate")]
                                    for c, v in patch[role].items() if v.get("Playerbase")],
                "role_wr_length": _role_wr_length(patch[role])}

    def pairs(table, kind):
        out = {}
        mine = table.get(role, {}).get(champ, {})
        pp = (p or {}).get(kind, {})
        for l2, vals in mine.items():
            rows = []
            for o, v in vals.items():
                if o == champ or v[0] is None or v[1] is None:
                    continue
                op = patch.get(l2, {}).get(o)
                pw = pp.get(l2, {}).get(o)
                rows.append([o, round(v[0], 3), round(v[1], 3), op["Pick_rate"] if op else None,
                             float(pw["win_rate"]) if pw else None, int(pw["games"]) if pw else None])
            out[l2] = sorted(rows, key=lambda r: r[1])
        return out

    blind = None
    B = st["blind"]
    if B and champ in B.get("roles", {}).get(role, {}):
        v = B["roles"][role][champ]
        blind = {k: v.get(k) for k in ("p_counter_matchups", "p_counter_matchups_synergies", "rank_matchups",
                                       "rank_matchups_synergies", "detail", "classification")}
        blind["n_role"] = len(B["roles"][role])
        blind["role_mean"] = B.get("role_means", {}).get(role)
        blind["params"] = {k: B["params"].get(k) for k in ("meta_patches", "counter_threshold", "pool_sizes", "min_playrate")}

    return {"champ": champ, "role": role, "roles": roles, "patch": info, "blind": blind,
            "matchups": pairs(st["md2"], "Matchups"), "synergies": pairs(st["sd2"], "Synergies")}
