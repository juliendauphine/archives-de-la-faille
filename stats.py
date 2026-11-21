"""Lit games/*.json (+ *_timeline.json) et calcule les stats par joueur et par partie."""
import glob, json, os

BASE = os.path.dirname(os.path.abspath(__file__))
GAMES = os.path.join(BASE, "games")
QUEUES = {0: "Personnalisée", 400: "Normale draft", 420: "Classée solo/duo", 430: "Normale blind",
          440: "Classée flex", 450: "ARAM", 700: "Clash", 710: "5c5 ranked", 1700: "Arena"}
ORDER = {"TOP": 0, "JUNGLE": 1, "MIDDLE": 2, "BOTTOM": 3, "UTILITY": 4}

ALIAS = {"top": "TOP", "jungle": "JUNGLE", "jgl": "JUNGLE", "jng": "JUNGLE", "mid": "MIDDLE", "middle": "MIDDLE",
         "adc": "BOTTOM", "bot": "BOTTOM", "bottom": "BOTTOM", "support": "UTILITY", "supp": "UTILITY",
         "sup": "UTILITY", "utility": "UTILITY"}

def tracked():
    """players.txt : NomDeJeu#TAG$Role1$Role2...  ->  [(label, [rôles Riot])]"""
    p = os.path.join(BASE, "players.txt")
    out = []
    if os.path.exists(p):
        for l in open(p, encoding="utf-8"):
            l = l.strip()
            if not l or l.startswith("//"):
                continue
            parts = [x.strip() for x in l.split("$")]
            out.append((parts[0], [ALIAS[x.lower()] for x in parts[1:] if x.lower() in ALIAS]))
    return out

def r(x, n=2):
    return None if x is None else round(x, n)

def build():
    T = tracked()
    labels = [l for l, _ in T]
    roles = {l: rl for l, rl in T}
    want = {l.lower(): l for l in labels}
    games, rows = [], []
    for path in glob.glob(os.path.join(GAMES, "*.json")):
        if path.endswith("_timeline.json"):
            continue
        try:
            m = json.load(open(path, encoding="utf-8"))
            info = m["info"]
            P = info["participants"]
        except Exception as e:
            print("ignoré", path, e); continue
        if any(p.get("gameEndedInEarlySurrender") for p in P):
            continue  # remake
        dur = info["gameDuration"]
        dur = dur / 1000 if dur > 10000 else dur
        minutes = dur / 60
        tp = path[:-5] + "_timeline.json"
        frames = json.load(open(tp, encoding="utf-8"))["info"]["frames"] if os.path.exists(tp) else []
        f15 = frames[15] if len(frames) > 15 and minutes >= 15 else None
        k15 = {}
        if f15:
            for fr in frames[:16]:
                for e in fr.get("events", []):
                    if e["type"] == "CHAMPION_KILL" and e["timestamp"] <= 900000:
                        k15[e["killerId"]] = k15.get(e["killerId"], 0) + 1
        tk = {100: 0, 200: 0}
        for p in P:
            tk[p["teamId"]] += p["kills"]

        def at15(p):
            if not f15: return None
            x = f15["participantFrames"].get(str(p["participantId"]))
            if not x: return None
            return {"gold": x["totalGold"], "cs": x["minionsKilled"] + x["jungleMinionsKilled"],
                    "dmg": x.get("damageStats", {}).get("totalDamageDoneToChampions")}

        out = []
        for p in P:
            name, tag = p.get("riotIdGameName") or p.get("summonerName", "?"), p.get("riotIdTagline", "")
            cs = p["totalMinionsKilled"] + p.get("neutralMinionsKilled", 0)
            k, d, a = p["kills"], p["deaths"], p["assists"]
            s = {"kda": (k + a) / max(1, d), "gpm": p["goldEarned"] / minutes, "cspm": cs / minutes,
                 "dpm": p["totalDamageDealtToChampions"] / minutes,
                 "kp": 100 * (k + a) / tk[p["teamId"]] if tk[p["teamId"]] else 0,
                 "gd15": None, "cs15": None, "csd15": None, "k15": None, "dpm15": None}
            me = at15(p)
            if me:
                s["cs15"] = me["cs"]
                s["k15"] = k15.get(p["participantId"], 0)
                if me["dmg"] is not None:
                    s["dpm15"] = me["dmg"] / 15
                pos = p.get("teamPosition")
                opp = next((q for q in P if pos and q["teamId"] != p["teamId"] and q.get("teamPosition") == pos), None)
                o = at15(opp) if opp else None
                if o:
                    s["gd15"] = me["gold"] - o["gold"]
                    s["csd15"] = me["cs"] - o["cs"]
            label = want.get(f"{name}#{tag}".lower()) or want.get(p.get("puuid", "").lower())
            out.append({"name": name, "tag": tag, "champ": p["championName"], "team": p["teamId"],
                        "pos": p.get("teamPosition", ""), "win": p["win"], "k": k, "d": d, "a": a,
                        "dmg": p["totalDamageDealtToChampions"], "gold": p["goldEarned"], "cs": cs,
                        "vis": p.get("visionScore", 0), "tr": bool(label), "s": {x: r(v) for x, v in s.items()}})
            if label:
                rows.append({"p": label, "game": m["metadata"]["matchId"], "date": info.get("gameCreation", 0),
                             "champ": p["championName"], "pos": p.get("teamPosition", ""), "win": p["win"], "k": k, "d": d, "a": a,
                             **{x: r(v) for x, v in s.items()}})
        out.sort(key=lambda e: (e["team"], ORDER.get(e["pos"], 9)))
        gd = [sum((1 if int(i) <= 5 else -1) * x["totalGold"] for i, x in fr["participantFrames"].items()) for fr in frames]
        games.append({"id": m["metadata"]["matchId"], "date": info.get("gameCreation", 0), "dur": round(dur),
                      "queueId": info.get("queueId"), "queue": QUEUES.get(info.get("queueId"), f"Queue {info.get('queueId')}"),
                      "win100": next(p["win"] for p in P if p["teamId"] == 100), "kills": tk, "gd": gd, "players": out})
    games.sort(key=lambda g: -g["date"])
    return {"tracked": labels, "roles": roles, "games": games, "rows": rows}
