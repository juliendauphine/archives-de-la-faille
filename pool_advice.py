#!/usr/bin/env python3
"""Champion pool conseillé pour chaque couple (joueur, rôle) -> percentiles/data/pool_advice.json.

Même méthode que la section 6 de notebooks/champion_pool.ipynb :
  1. obligatoires (≤ MAX_MUST) : ajout forcé (≥ FORCE_SHARE des parties du poste et WR > FORCE_WR),
     puis maîtrise (score B, ≥ MASTERY_MIN_N parties et WR lissé ≥ MASTERY_MIN_LISS) ;
  2. places restantes parmi les champions méta du rôle (blindability_data.json) ;
  score = Σ poids × terme en Δσ (lane, out, syn, mastery, util), contrainte : au moins un blind (P(counter) < BLIND_MAX_P).
Un champion n'est pickable qu'une fois par partie : il ne répond pas à lui-même et ne joue pas avec lui-même.

Usage : python pool_advice.py
"""
import itertools
import json
import math
import os
import re
from math import comb

import numpy as np
import pandas as pd

import stats
from stats import BASE

DATA_DIR = os.path.join(BASE, "percentiles", "data")
OUT = os.path.join(DATA_DIR, "pool_advice.json")

# ---------------------------------------------------------------- configuration
POOL_SIZE = 5
TOP_X = {5: 2, 6: 3}
MAX_MUST = 4
FORCE_SHARE, FORCE_WR = 0.25, 0.47
MASTERY_MIN_N, MASTERY_MIN_LISS = 15, 0.50
BLIND_MAX_P = 0.50
BLIND_MODE = "matchups_synergies"          # mode par défaut (pool_advice.json) ; la page peut demander l'autre
BLIND_MODES = ("matchups", "matchups_synergies")
# lane / out : couverture des matchups · syn : synergie globale · util : couverture des synergies · mastery : maîtrise du joueur
DEFAULT_W = {"lane": 0.7, "out": 0.4, "syn": 1.1, "mastery": 0.5, "util": 0}
WEIGHTS = {r: dict(DEFAULT_W) for r in ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]}
BANNED = {r: [] for r in ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]}   # champions exclus, par rôle
SHRINK, NOISE_FACTOR = True, 2.0
MAX_EXHAUSTIVE = 600_000
N_NORM_SAMPLE = 20_000
N_POOLS = 10           # pools conseillés exportés par (joueur, rôle)
SEED = 0

# score B (classement du champion pool, identique au site / notebook)
MIN_N, M_PRIOR, ALPHA, BETA, CLIP = 3, 8, 1.5, 0.1, (0.85, 1.15)
PERF_STATS = ["kda", "kp", "dpm", "gpm", "cspm", "gd15", "csd15"]

LANE_OF = {"TOP": "top", "JUNGLE": "jungle", "MIDDLE": "middle", "BOTTOM": "bottom", "UTILITY": "support"}
LANES = ["top", "jungle", "middle", "bottom", "support"]
TERMS = ["lane", "out", "syn", "mastery", "util"]

_ALIAS = {"monkeyking": "wukong", "nunuwillump": "nunu", "renataglasc": "renata"}


def key(name):
    k = re.sub(r"[^a-z0-9]", "", str(name).lower())
    return _ALIAS.get(k, k)


def _load(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------- score B du joueur
def player_table(D, player, role):
    src = [r for r in D["rows"] if r["p"] == player]
    for v in D["ranked"].get(player, {}).values():
        src += v["rows"]
    if not src:
        return None, 0
    df = pd.DataFrame(src).drop_duplicates("game")
    df = df[df["pos"] == role].copy()
    if df.empty:
        return None, 0
    df["win"] = df["win"].astype(int)
    for s in PERF_STATS:
        col = pd.to_numeric(df[s], errors="coerce")
        df["z_" + s] = (col - col.mean()) / col.std()
    df["z_perf"] = df[["z_" + s for s in PERF_STATS]].mean(axis=1)
    t = df.groupby("champ").agg(n=("win", "size"), w=("win", "sum"), z_perf=("z_perf", "mean"))
    t = t[t["n"] >= MIN_N].copy()
    t["wr"] = t["w"] / t["n"]
    t["wr_liss"] = (t["w"] + 0.5 * M_PRIOR) / (t["n"] + M_PRIOR)
    perf = (1 + BETA * t["z_perf"].fillna(0)).clip(*CLIP)
    t["score_B"] = np.log1p(t["n"]) * (t["wr_liss"] / 0.5) ** ALPHA * perf
    t["share"] = t["n"] / len(df)
    return t.sort_values("score_B", ascending=False), len(df)


def must_haves(T, n_games, meta_name, banned_k):
    if T is None or T.empty:
        return []
    T = T.loc[[key(c) not in banned_k for c in T.index]]
    forced = T[(T["share"] >= FORCE_SHARE) & (T["wr"] > FORCE_WR)]
    mastery = T[(T["n"] >= MASTERY_MIN_N) & (T["wr_liss"] >= MASTERY_MIN_LISS) & ~T.index.isin(forced.index)]
    rows = [(c, "ajout forcé") for c in forced.index] + [(c, "maîtrise") for c in mastery.index]
    out = []
    for c, why in rows:
        m = meta_name.get(key(c))
        if m and m not in [o["c"] for o in out]:
            out.append({"c": m, "reason": why})
    return out[:min(MAX_MUST, POOL_SIZE)]


# ---------------------------------------------------------------- matrices Δ2 d'un rôle
class RoleData:
    def __init__(self, role, B, MATCHUP_D2, SYNERGY_D2, extra=(), display_only=(), draft_bans=(), blind_mode=None):
        self.role, self.lane = role, LANE_OF[role]
        lane = self.lane
        # bans de draft (page web) : le champion n'est jouable par personne -> retiré des adversaires et des alliés
        ban_k = {key(c) for c in draft_bans}
        self.pick = {l: {c: v["pick_rate"] for c, v in B["roles"][l].items() if key(c) not in ban_k} for l in LANES}
        banned_k = {key(c) for c in BANNED.get(role, [])} | ban_k
        univ = list(dict.fromkeys(list(self.pick[lane]) + list(extra)))
        self.univ = [c for c in univ if c in MATCHUP_D2[lane] and key(c) not in banned_k]
        n_cand = len(self.univ)
        # champions hors méta du pool de départ : présents dans les matrices (bans), jamais candidats
        self.univ += [c for c in dict.fromkeys(display_only) if c in MATCHUP_D2[lane] and c not in self.univ]
        self.cand = set(range(n_cand))
        self.idx = {c: i for i, c in enumerate(self.univ)}
        # blind pick jugé sur la chance d'être contré « matchups seuls » ou « matchups + synergies alliées »
        self.blind_mode = blind_mode if blind_mode in BLIND_MODES else BLIND_MODE
        p_counter = {c: v["p_counter_" + self.blind_mode] for c, v in B["roles"][lane].items()}
        self.pcount = np.array([p_counter.get(c, 1.0) for c in self.univ])
        self.is_blind = self.pcount < BLIND_MAX_P
        self.blocks = {"lane": [self._build(MATCHUP_D2, lane)],
                       "out": [self._build(MATCHUP_D2, l) for l in LANES if l != lane],
                       "syn": [self._build(SYNERGY_D2, l) for l in LANES if l != lane]}

    def _build(self, table, opp_lane):
        lane = self.lane
        opps = list(self.pick[opp_lane])
        w = np.array([self.pick[opp_lane][o] for o in opps], float)
        M = np.zeros((len(self.univ), len(opps)))
        SE2 = np.full_like(M, np.nan)
        for i, c in enumerate(self.univ):
            vals = table[lane].get(c, {}).get(opp_lane, {})
            for j, o in enumerate(opps):
                v = vals.get(o)
                if v is not None and o != c and np.isfinite(v[0]) and np.isfinite(v[1]):
                    M[i, j] = v[0]
                    SE2[i, j] = NOISE_FACTOR * (v[1] / 1.96) ** 2
        if SHRINK:
            ok = ~np.isnan(SE2)
            for i in range(len(self.univ)):
                if ok[i].sum() < 3:
                    continue
                d, se2 = M[i, ok[i]], SE2[i, ok[i]]
                mu = d.mean()
                tau2 = max(d.var() - se2.mean(), 0.05)
                M[i, ok[i]] = mu + (d - mu) * tau2 / (tau2 + se2)
        same = np.array([[key(o) == key(c) for o in opps] for c in self.univ])
        M[same] = np.nan
        return {"opps": opps, "w": w / w.sum(), "M": M, "lane": opp_lane}


def topx_cover(M, pools, x):
    S = np.sort(np.nan_to_num(M[pools], nan=-np.inf), axis=1)
    return S[:, -x:, :].mean(axis=1)


# ---------------------------------------------------------------- bans conseillés
N_BANS = 5
MAX_BLIND_BANS = 3        # au plus 3 places réservées aux counters du blind
BLIND_COUNTER_PTS = -1.0  # Δ2 (pts de WR, rétréci) sous lequel un adversaire est un counter du blind


def pool_bans(R, champs, blind=None, n=N_BANS):
    """Top n bans en lane pour un pool.
    1. en priorité les counters du blind (il est pické en premier, l'adversaire peut le contrer directement) :
       Δ2(blind, o) ≤ BLIND_COUNTER_PTS, classés par pick rate × (−Δ2), au plus MAX_BLIND_BANS ;
    2. puis les counters globaux : pick rate × (−couverture top-X du pool)."""
    X = TOP_X.get(POOL_SIZE, 2)
    idx = [R.idx[c] for c in champs if c in R.idx]
    if not idx:
        return []
    if blind is None or blind not in R.idx:
        blind = min((R.univ[i] for i in idx), key=lambda c: R.pcount[R.idx[c]])
    b = R.blocks["lane"][0]
    mine = {key(c) for c in champs}
    rows = []
    for j, o in enumerate(b["opps"]):
        if key(o) in mine:
            continue
        col = b["M"][idx, j]
        ok = ~np.isnan(col)
        if not ok.any():
            continue
        order = [k for k in np.argsort(-np.nan_to_num(col, nan=-np.inf)) if ok[k]][:X]
        cov = float(np.mean(col[order]))
        pr = R.pick[R.lane][o]
        bd = b["M"][R.idx[blind], j]
        bd = None if np.isnan(bd) else float(bd)
        rows.append({"c": o, "pr": round(pr, 2), "cover": round(cov, 2),
                     "best": [[R.univ[idx[k]], round(float(col[k]), 2)] for k in order],
                     "blind_d2": None if bd is None else round(bd, 2),
                     "t_global": round(pr * -cov, 3),
                     "t_blind": None if bd is None else round(pr * -bd, 3)})
    blind_c = sorted([r for r in rows if r["blind_d2"] is not None and r["blind_d2"] <= BLIND_COUNTER_PTS],
                     key=lambda r: -r["t_blind"])[:MAX_BLIND_BANS]
    picked = {r["c"] for r in blind_c}
    glob = sorted([r for r in rows if r["c"] not in picked], key=lambda r: -r["t_global"])[:n - len(blind_c)]
    top_global = {r["c"] for r in sorted(rows, key=lambda r: -r["t_global"])[:n] if r["t_global"] > 0}
    out = []
    for r in blind_c:
        out.append(dict(r, reason="both" if r["c"] in top_global else "blind"))
    for r in glob:   # un counter du blind classé ici (peu joué) reste signalé comme tel
        is_bc = r["blind_d2"] is not None and r["blind_d2"] <= BLIND_COUNTER_PTS
        out.append(dict(r, reason="both" if is_bc else "global"))
    return {"blind": blind, "list": out}


# ---------------------------------------------------------------- optimisation pour un joueur
def optimise(R, must, mastery, weights, rng, also=None):
    """Retourne (pools conseillés, entrée du pool `also`) ; `also` (ex. pool détecté du joueur) est noté avec la même
    normalisation que les pools conseillés pour être comparable, mais n'entre pas dans le classement."""
    X = TOP_X.get(POOL_SIZE, 2)
    must_idx = [R.idx[c] for c in must if c in R.idx]
    free_idx = [i for i in sorted(R.cand) if i not in must_idx]
    k_free = POOL_SIZE - len(must_idx)

    def raw_terms(pools):
        pools = np.atleast_2d(pools)
        out = {k: np.mean([topx_cover(b["M"], pools, X) @ b["w"] for b in R.blocks[k]], axis=0) for k in ("lane", "out")}
        out["syn"] = np.mean([np.nanmean(b["M"][pools], axis=1) @ b["w"] for b in R.blocks["syn"]], axis=0)
        out["util"] = np.mean([topx_cover(b["M"], pools, X) @ b["w"] for b in R.blocks["syn"]], axis=0)
        out["mastery"] = mastery[pools].mean(axis=1)
        out["valid"] = R.is_blind[pools].any(axis=1)
        return out

    sample = np.array([must_idx + list(rng.choice(free_idx, k_free, replace=False)) for _ in range(N_NORM_SAMPLE)])
    r0 = raw_terms(sample)
    norm = {t: (r0[t].mean(), r0[t].std() or 1.0) for t in TERMS}

    def score(pools):
        r = raw_terms(pools)
        z = {t: (r[t] - norm[t][0]) / norm[t][1] for t in TERMS}
        z["total"] = np.where(r["valid"], sum(weights[t] * z[t] for t in TERMS), -np.inf)
        return z

    best = {}
    n_comb = comb(len(free_idx), k_free)
    if n_comb <= MAX_EXHAUSTIVE:
        it = itertools.combinations(free_idx, k_free)
        while True:
            chunk = list(itertools.islice(it, 20_000))
            if not chunk:
                break
            pools = np.array([must_idx + list(c) for c in chunk])
            tot = score(pools)["total"]
            for i in np.argsort(-tot)[:N_POOLS * 4]:
                if np.isfinite(tot[i]):
                    best[tuple(sorted(chunk[i]))] = tot[i]
            best = dict(sorted(best.items(), key=lambda kv: -kv[1])[:N_POOLS * 4])
    else:   # recherche locale par échanges, plusieurs départs
        for _ in range(30):
            cur = list(rng.choice(free_idx, k_free, replace=False))
            cur_tot = score(np.array([must_idx + cur]))["total"][0]
            improved = True
            while improved:
                improved = False
                cand = [(p, c) for p in range(k_free) for c in free_idx if c not in cur]
                pools = np.array([must_idx + cur[:p] + [c] + cur[p + 1:] for p, c in cand])
                tot = score(pools)["total"]
                for (p, c), t in zip(cand, tot):
                    if np.isfinite(t):
                        best[tuple(sorted(cur[:p] + [c] + cur[p + 1:]))] = t
                j = int(np.argmax(tot))
                if tot[j] > cur_tot + 1e-9:
                    p, c = cand[j]
                    cur[p], cur_tot, improved = c, tot[j], True

    def entry(pool):
        z = score(np.array([pool]))
        names = [R.univ[i] for i in pool]
        played = [(mastery[i], R.univ[i]) for i in pool if mastery[i] > 0]
        blind = R.univ[min(pool, key=lambda i: R.pcount[i])]
        zz = {t: round(float(z[t][0]), 3) for t in TERMS}
        # total sans la contrainte de blind (sinon −inf) ; valid dit si le pool contient un blind correct
        zz["total"] = round(float(sum(weights[t] * z[t][0] for t in TERMS)), 3)
        return {"champs": names, "z": zz, "valid": bool(R.is_blind[pool].any()), "blind": blind,
                "main": max(played)[1] if played else None, "bans": pool_bans(R, names, blind)}

    out = [entry(must_idx + list(free)) for free, _ in sorted(best.items(), key=lambda kv: -kv[1])[:N_POOLS]]
    also_idx = [R.idx[c] for c in (also or []) if c in R.idx]
    return out, (entry(also_idx) if len(also_idx) >= X else None)


# ---------------------------------------------------------------- recalcul à la demande (serveur web)
_CTX = {}


def _context(max_age=300):
    import time
    now = time.time()
    if "B" not in _CTX:
        _CTX["B"] = _load("blindability_data.json")
        _CTX["MATCHUP_D2"] = _load("matchup_d2_data.json")
        _CTX["SYNERGY_D2"] = _load("synergie_d2_data.json")
        _CTX["meta_name"] = {key(c): c for l in LANES for c in _CTX["MATCHUP_D2"][l]}
    if now - _CTX.get("D_time", 0) > max_age:
        _CTX["D"], _CTX["D_time"] = stats.build(), now
    return _CTX


def advise_pair(player, role, draft_bans=(), locks=None, blind_mode=None):
    """Recalcule les N_POOLS pools conseillés d'un couple (joueur, rôle) avec des champions bannis (exclus des deux équipes).
    locks : None = obligatoires automatiques ; sinon liste explicite des champions imposés dans le pool (remplace les
    automatiques, qui gardent leur raison s'ils y figurent ; les autres sont des « lock manuel »).
    Retourne le même format que players[p][role] de pool_advice.json, plus les données de rôle utiles au graphe."""
    if role not in LANE_OF:
        raise ValueError("rôle inconnu")
    ctx = _context()
    D, meta_name = ctx["D"], ctx["meta_name"]
    bans = list(dict.fromkeys(meta_name.get(key(c), c) for c in draft_bans))
    ban_k = {key(c) for c in bans} | {key(c) for c in BANNED.get(role, [])}
    T, n = player_table(D, player, role)
    must = must_haves(T, n, meta_name, ban_k)
    ignored = []
    if locks is not None:
        auto = {m["c"]: m["reason"] for m in must}
        lane = LANE_OF[role]
        must = []
        for c in locks:
            m = meta_name.get(key(c))
            if not m or m not in ctx["MATCHUP_D2"][lane] or key(m) in ban_k:
                ignored.append(c)
            elif m not in [x["c"] for x in must]:
                must.append({"c": m, "reason": auto.get(m, "lock manuel")})
        must = must[:POOL_SIZE]
    start = []
    if T is not None:
        for c in T.index[:POOL_SIZE]:
            m = meta_name.get(key(c))
            if m and m not in start:
                start.append(m)
    R = RoleData(role, ctx["B"], ctx["MATCHUP_D2"], ctx["SYNERGY_D2"], [m["c"] for m in must], start, bans, blind_mode)
    mastery = np.zeros(len(R.univ))
    if T is not None:
        for c, row in T.iterrows():
            m = meta_name.get(key(c))
            if m in R.idx:
                mastery[R.idx[m]] = max(mastery[R.idx[m]], row["score_B"])
    pools, start_e = optimise(R, [m["c"] for m in must], mastery, WEIGHTS[role], np.random.default_rng(SEED), start)
    lane_b = R.blocks["lane"][0]
    shown = {c for q in pools for c in q["champs"]} | set(start)
    return {
        "games": int(n), "must": must, "pools": pools, "bans_applied": bans, "locks_ignored": ignored,
        "blind_mode": R.blind_mode,
        "start": start_e or {"champs": start, "bans": pool_bans(R, start)},
        "role": {"opps": lane_b["opps"], "pr": [round(R.pick[R.lane][o], 3) for o in lane_b["opps"]],
                 "d2": {c: [None if not np.isfinite(v) else round(float(v), 2) for v in lane_b["M"][R.idx[c]]]
                        for c in shown if c in R.idx},
                 # champions lockés hors méta : pas de données de blindabilité -> absents (affichés « – »)
                 "p_counter": {c: round(float(R.pcount[i]), 4) for i, c in enumerate(R.univ)
                               if c in ctx["B"]["roles"][R.lane]},
                 "syn": syn_export(R, shown),
                 "lockable": lockable(ctx["MATCHUP_D2"], role)},
    }


def syn_export(R, champs):
    """Synergies Δ2 (rétrécies, comme pour le score) des champions `champs` avec les alliés de chaque autre lane."""
    rnd = lambda v: None if not np.isfinite(v) else round(float(v), 2)
    return {b["lane"]: {"opps": b["opps"], "pr": [round(R.pick[b["lane"]][o], 3) for o in b["opps"]],
                        "d2": {c: [rnd(v) for v in b["M"][R.idx[c]]] for c in champs if c in R.idx}}
            for b in R.blocks["syn"]}


def lockable(MATCHUP_D2, role):
    """Champions qu'on peut imposer dans le pool d'un rôle : présents dans matchup_d2_data.json pour cette lane."""
    banned_k = {key(c) for c in BANNED.get(role, [])}
    return sorted(c for c in MATCHUP_D2[LANE_OF[role]] if key(c) not in banned_k)


def main():
    B = _load("blindability_data.json")
    MATCHUP_D2 = _load("matchup_d2_data.json")
    SYNERGY_D2 = _load("synergie_d2_data.json")
    D = stats.build()
    rng = np.random.default_rng(SEED)
    X = TOP_X.get(POOL_SIZE, 2)

    meta_name = {key(c): c for l in LANES for c in MATCHUP_D2[l]}
    pairs = [(p, r) for p, roles in D.get("roles", {}).items() for r in roles if r in LANE_OF]

    # obligatoires et maîtrise de chaque couple, pour connaître l'univers de chaque rôle
    info = {}
    for p, role in pairs:
        T, n = player_table(D, p, role)
        banned_k = {key(c) for c in BANNED.get(role, [])}
        info[(p, role)] = (T, n, must_haves(T, n, meta_name, banned_k))

    out = {"params": {"pool_size": POOL_SIZE, "top_x": X, "weights": WEIGHTS, "blind_max_p": BLIND_MAX_P,
                      "blind_mode": BLIND_MODE, "shrink": SHRINK, "meta_patches": B["params"]["meta_patches"],
                      "force": [FORCE_SHARE, FORCE_WR], "mastery_min": [MASTERY_MIN_N, MASTERY_MIN_LISS],
                      "banned": BANNED},
           "roles": {}, "players": {}}

    for role in sorted({r for _, r in pairs}):
        extra = [m["c"] for (p, r), (_, _, must) in info.items() if r == role for m in must]
        starts = [meta_name.get(key(c)) for (p, r), (T, _, _) in info.items() if r == role and T is not None
                  for c in T.index[:POOL_SIZE]]
        R = RoleData(role, B, MATCHUP_D2, SYNERGY_D2, extra, [c for c in starts if c])
        lane_b = R.blocks["lane"][0]
        out["roles"][role] = {
            "opps": lane_b["opps"],
            "pr": [round(R.pick[R.lane][o], 3) for o in lane_b["opps"]],
            "d2": {c: [None if not np.isfinite(v) else round(float(v), 2) for v in lane_b["M"][i]] for i, c in enumerate(R.univ)},
            "p_counter": {c: round(float(R.pcount[i]), 4) for i, c in enumerate(R.univ)},
            "syn": syn_export(R, R.univ),
            # champions lockables à la main : tous ceux des matrices Δ2 du rôle (méta ou non) ; jamais candidats sans lock
            "lockable": lockable(MATCHUP_D2, role),
        }
        for (p, r), (T, n, must) in info.items():
            if r != role:
                continue
            mastery = np.zeros(len(R.univ))
            if T is not None:
                for c, row in T.iterrows():
                    m = meta_name.get(key(c))
                    if m in R.idx:
                        mastery[R.idx[m]] = max(mastery[R.idx[m]], row["score_B"])
            # pool de départ = champion pool classique du site (top 5 du score B, ≥ MIN_N parties)
            start = []
            if T is not None:
                for c in T.index[:POOL_SIZE]:
                    m = meta_name.get(key(c))
                    if m and m not in start:
                        start.append(m)
            pools, start_e = optimise(R, [m["c"] for m in must], mastery, WEIGHTS[role], rng, start)
            out["players"].setdefault(p, {})[role] = {
                "games": int(n), "must": must, "pools": pools,
                "start": start_e or {"champs": start, "bans": pool_bans(R, start)}}
            best = pools[0]["champs"] if pools else []
            print(f"{p:22s} {role:8s} {n:4d} parties · obligatoires {[m['c'] for m in must]} -> {' · '.join(best)}")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("écrit :", OUT)


if __name__ == "__main__":
    main()
