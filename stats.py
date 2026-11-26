"""Lit games/*.json (+ *_timeline.json) et calcule les stats par joueur et par partie.
Contient aussi analyze(), réutilisée par ranked.py pour les parties SoloQ / Flex en cache."""
import datetime, glob, json, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
GAMES = os.path.join(BASE, "games")
CACHE = os.path.join(BASE, "cache")
RANKED_QUEUES = (("soloq", 420), ("flex", 440))
QUEUES = {0: "Personnalisée", 400: "Normale draft", 420: "Classée solo/duo", 430: "Normale blind",
          440: "Classée flex", 450: "ARAM", 700: "Clash", 710: "5c5 ranked", 1700: "Arena"}
ORDER = {"TOP": 0, "JUNGLE": 1, "MIDDLE": 2, "BOTTOM": 3, "UTILITY": 4}
ALIAS = {"top": "TOP", "jungle": "JUNGLE", "jgl": "JUNGLE", "jng": "JUNGLE", "mid": "MIDDLE", "middle": "MIDDLE",
         "adc": "BOTTOM", "bot": "BOTTOM", "bottom": "BOTTOM", "support": "UTILITY", "supp": "UTILITY",
         "sup": "UTILITY", "utility": "UTILITY"}


def tracked():
    """players.txt : NomDeJeu#TAG$Role1$Role2$Champion  ->  [(label, [rôles Riot], champion)]"""
    p = os.path.join(BASE, "players.txt")
    out = []
    if os.path.exists(p):
        for l in open(p, encoding="utf-8"):
            l = l.strip()
            if not l or l.startswith("//"):
                continue
            parts = [x.strip() for x in l.split("$")]
            roles = [ALIAS[x.lower()] for x in parts[1:] if x.lower() in ALIAS]
            champ = next((x for x in parts[1:] if x and x.lower() not in ALIAS), "")
            out.append((parts[0], roles, champ))
    return out


def r(x, n=2):
    return None if x is None else round(x, n)


def season_start_ms():
    """« Saison » = année civile en cours."""
    return int(datetime.datetime(datetime.date.today().year, 1, 1).timestamp() * 1000)


def cache_path(label, queue):
    return os.path.join(CACHE, re.sub(r"[^\w\-]+", "_", label) + f"_{queue}.json")


def analyze(m, frames):
    """Stats de chacun des 10 participants. Renvoie None pour un remake."""
    info = m["info"]
    P = info["participants"]
    if any(p.get("gameEndedInEarlySurrender") for p in P):
        return None
    dur = info["gameDuration"]
    dur = dur / 1000 if dur > 10000 else dur
    minutes = dur / 60
    f15 = frames[15] if len(frames) > 15 and minutes >= 15 else None
    k15 = {}
    if f15:
        for fr in frames[:16]:
            for e in fr.get("events", []):
                if e["type"] == "CHAMPION_KILL" and e["timestamp"] <= 900000:
                    k15[e["killerId"]] = k15.get(e["killerId"], 0) + 1
    tk, td = {100: 0, 200: 0}, {100: 0, 200: 0}
    for p in P:
        tk[p["teamId"]] += p["kills"]
        td[p["teamId"]] += p["totalDamageDealtToChampions"]

    def at15(p):
        if not f15:
            return None
        x = f15["participantFrames"].get(str(p["participantId"]))
        if not x:
            return None
        return {"gold": x["totalGold"], "cs": x["minionsKilled"] + x["jungleMinionsKilled"],
                "dmg": x.get("damageStats", {}).get("totalDamageDoneToChampions")}

    stats = []
    for p in P:
        k, d, a = p["kills"], p["deaths"], p["assists"]
        cs = p["totalMinionsKilled"] + p.get("neutralMinionsKilled", 0)
        dmg = p["totalDamageDealtToChampions"]
        t = p["teamId"]
        s = {"kda": (k + a) / max(1, d), "kp": 100 * (k + a) / tk[t] if tk[t] else 0,
             "fb_pct": 100.0 if p.get("firstBloodKill") else 0.0,
             "solo_kills": p.get("challenges", {}).get("soloKills", 0),
             "dpm": dmg / minutes, "dmg_per_gold": dmg / max(1, p["goldEarned"]),
             "dmg_share": 100 * dmg / td[t] if td[t] else 0,
             "gpm": p["goldEarned"] / minutes, "cspm": cs / minutes, "vspm": p.get("visionScore", 0) / minutes,
             "gold15": None, "cs15": None, "csd15": None, "gd15": None, "k15": None, "dpm15": None}
        me = at15(p)
        if me:
            s["gold15"], s["cs15"] = me["gold"], me["cs"]
            s["k15"] = k15.get(p["participantId"], 0)
            if me["dmg"] is not None:
                s["dpm15"] = me["dmg"] / 15
            pos = p.get("teamPosition")
            opp = next((q for q in P if pos and q["teamId"] != t and q.get("teamPosition") == pos), None)
            o = at15(opp) if opp else None
            if o:
                s["gd15"] = me["gold"] - o["gold"]
                s["csd15"] = me["cs"] - o["cs"]
        stats.append({x: r(v) for x, v in s.items()})
    return {"P": P, "dur": dur, "minutes": minutes, "tk": tk, "stats": stats}


def make_row(mid, info, p, s):
    return {"game": mid, "date": info.get("gameCreation", 0), "champ": p["championName"],
            "pos": p.get("teamPosition", ""), "win": p["win"], "k": p["kills"], "d": p["deaths"],
            "a": p["assists"], **s}


def build():
    T = tracked()
    labels = [t[0] for t in T]
    roles = {t[0]: t[1] for t in T}
    champs = {t[0]: t[2] for t in T if t[2]}
    want = {l.lower(): l for l in labels}
    games, rows = [], []
    for path in glob.glob(os.path.join(GAMES, "*.json")):
        if path.endswith("_timeline.json"):
            continue
        try:
            m = json.load(open(path, encoding="utf-8"))
            tp = path[:-5] + "_timeline.json"
            tl = json.load(open(tp, encoding="utf-8"))["info"]["frames"] if os.path.exists(tp) else []
            a = analyze(m, tl)
            info = m["info"]
        except Exception as e:
            print("ignoré", path, e)
            continue
        if a is None:
            continue  # remake
        P, tk = a["P"], a["tk"]
        out = []
        for p, s in zip(P, a["stats"]):
            name, tag = p.get("riotIdGameName") or p.get("summonerName", "?"), p.get("riotIdTagline", "")
            label = want.get(f"{name}#{tag}".lower()) or want.get(p.get("puuid", "").lower())
            out.append({"name": name, "tag": tag, "champ": p["championName"], "team": p["teamId"],
                        "pos": p.get("teamPosition", ""), "win": p["win"], "k": p["kills"], "d": p["deaths"],
                        "a": p["assists"], "dmg": p["totalDamageDealtToChampions"], "gold": p["goldEarned"],
                        "cs": p["totalMinionsKilled"] + p.get("neutralMinionsKilled", 0),
                        "vis": p.get("visionScore", 0), "tr": bool(label), "s": s})
            if label:
                rows.append({"p": label, **make_row(m["metadata"]["matchId"], info, p, s)})
        out.sort(key=lambda e: (e["team"], ORDER.get(e["pos"], 9)))
        gd = [sum((1 if int(i) <= 5 else -1) * x["totalGold"] for i, x in fr["participantFrames"].items()) for fr in tl]
        games.append({"id": m["metadata"]["matchId"], "date": info.get("gameCreation", 0), "dur": round(a["dur"]),
                      "queueId": info.get("queueId"),
                      "queue": QUEUES.get(info.get("queueId"), f"Queue {info.get('queueId')}"),
                      "win100": next(p["win"] for p in P if p["teamId"] == 100), "kills": tk,
                      "gd": gd, "gdt": [fr["timestamp"] // 1000 for fr in tl], "players": out})
    games.sort(key=lambda g: -g["date"])

    # parties SoloQ / Flex de la saison, mises en cache par ranked.py
    ranked, start = {}, season_start_ms()
    for label in labels:
        ranked[label] = {}
        for name, q in RANKED_QUEUES:
            p = cache_path(label, q)
            if not os.path.exists(p):
                continue
            try:
                c = json.load(open(p, encoding="utf-8"))
            except Exception as e:
                print("cache illisible", p, e)
                continue
            ranked[label][name] = {"checked": c.get("checked"),
                                   "rows": [x for x in c.get("games", {}).values() if x.get("date", 0) >= start]}
    return {"tracked": labels, "roles": roles, "champs": champs, "games": games, "rows": rows, "ranked": ranked}