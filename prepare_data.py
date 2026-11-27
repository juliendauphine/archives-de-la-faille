#!/usr/bin/env python3
"""Précalcule les données de la page champion -> percentiles/data/champion_meta/ (à versionner).

À relancer après chaque changement de données (nouveau patch lolalytics, matchup_d2 / synergie_d2, blindability) :
    python prepare_data.py
Le serveur ne charge plus le gros fichier lolalytics (≈ 100 Mo, ≈ 285 Mo en RAM) : il lit ces petits fichiers JSON.
Au démarrage, il signale dans les logs si une source a changé depuis le dernier passage de ce script.

Sources (percentiles/data) :
  - lolalytics_data_<patch>_emerald_plus_all.json : le patch le plus récent présent (winrate, pick / ban rate,
    winrates des matchups / synergies du patch). Ajouter le fichier du nouveau patch puis relancer ce script suffit.
  - matchup_d2_data.json / synergie_d2_data.json : Δ2 multi-patchs (notebooks matchups_clean / synergies_clean, bias_d2).
  - blindability_data.json : probabilité d'être contré (notebook blindability_roles).

True winrate = winrate brut − biais de sélection de chaque rôle (matchups des 5 rôles adverses + synergies des 4 alliés),
biais = brut − winrate repondéré par les pick rates du patch (même calcul que get_true_winrate_per_patch / bias_d2.py).

Fichiers produits (corps exacts des réponses de /champion_api) :
  index.json            noms connus, rôles de chaque champion, rôle par défaut, empreintes des sources
  list.json             liste des champions par rôle
  scaling_<lane>.json   courbes de scaling du rôle
  <lane>/<nom>.json     fiche d'un champion dans un rôle
"""
import glob
import json
import os
import shutil

from champion_meta import DATA_DIR, LANES, OUT_DIR, file_name, patch_files, source_hashes

MIN_PLAYRATE = 0.2          # champions pris en compte dans la repondération (comme matchups_clean.ipynb)


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


def load_state():
    files = patch_files()
    patch = name = None
    if files:
        _, name, path = files[-1]
        with open(path, encoding="utf-8") as f:
            patch = json.load(f)
    return {"patch": patch, "patch_name": name, "biases": _biases(patch) if patch else None,
            "md2": _load_json("matchup_d2_data.json") or {}, "sd2": _load_json("synergie_d2_data.json") or {},
            "blind": _load_json("blindability_data.json")}


# ------------------------------------------------------------------ contenu des réponses
def champion_list(st):
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


def scaling(st, role):
    """Courbes de scaling du rôle (winrate par durée de partie) : tous les champions + moyenne du rôle."""
    lane = (st["patch"] or {}).get(role, {})
    return {"patch": st["patch_name"], "role": _role_wr_length(lane),
            "champs": {c: v["WR_vs_length"] for c, v in lane.items() if v.get("WR_vs_length")}}


def champion(st, champ, role):
    """Fiche d'un champion (nom exact) dans un de ses rôles."""
    patch = st["patch"] or {}
    roles = [l for l in LANES if champ in st["md2"].get(l, {}) or champ in patch.get(l, {})]

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


# ------------------------------------------------------------------ écriture
def _write(rel, body):
    path = os.path.join(OUT_DIR, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:   # mêmes octets que la réponse de /champion_api
        f.write(json.dumps(body, ensure_ascii=False).encode("utf-8"))


def main():
    if not patch_files():
        raise SystemExit("aucun fichier lolalytics_data_<patch>_emerald_plus_all.json dans " + DATA_DIR)
    st = load_state()
    patch = st["patch"] or {}
    names = sorted({c for src in (st["md2"], patch) for l in LANES for c in src.get(l, {}) if l in src})
    files = {}
    for c in names:   # un nom de fichier par champion : deux noms ne doivent pas donner le même
        f = file_name(c)
        if f in files:
            raise SystemExit(f"noms de fichier en conflit : {files[f]!r} et {c!r}")
        files[f] = c

    if os.path.isdir(OUT_DIR):
        shutil.rmtree(OUT_DIR)   # repart de zéro : pas de fiche orpheline d'un champion disparu
    roles, best, n = {}, {}, 0
    for c in names:
        rs = [l for l in LANES if c in st["md2"].get(l, {}) or c in patch.get(l, {})]
        if not rs:
            continue
        roles[c] = rs
        best[c] = max(rs, key=lambda l: patch.get(l, {}).get(c, {}).get("Pick_rate", 0))
        for r in rs:
            _write(os.path.join(r, file_name(c)), champion(st, c, r))
            n += 1
    _write("list.json", champion_list(st))
    for l in LANES:
        _write(f"scaling_{l}.json", scaling(st, l))
    _write("index.json", {"patch": st["patch_name"], "sources": source_hashes(), "names": names,
                          "roles": roles, "best": best})
    size = sum(os.path.getsize(p) for p in glob.glob(os.path.join(OUT_DIR, "**", "*.json"), recursive=True))
    print(f"patch {st['patch_name']} : {n} fiches champion, {size / 1e6:.1f} Mo -> {OUT_DIR}")


if __name__ == "__main__":
    main()
