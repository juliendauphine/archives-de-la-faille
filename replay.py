"""Visualiseur de parties (onglet Replay) : prépare les données d'une partie de games/ pour site/replay/.

Porté du projet visu_lol (build.py) : à partir de <ID>.json + <ID>_timeline.json (Riot Match-V5), reconstitue
positions, inventaires, morts, retours à la base, objectifs… Les métadonnées Data Dragon (champions, sorts, runes,
items) du patch de la partie sont mises en cache dans cache/ddragon/.

Servi par serve.py sur /replay_api?id=<MATCH_ID> ; build.py écrit aussi site/replays/<ID>.json pour un hébergement
statique.
"""
from __future__ import annotations

import bisect
import json
import os
import threading
import urllib.request
from collections import OrderedDict
from pathlib import Path

from stats import BASE, GAMES

CACHE_DIR = Path(BASE) / "cache" / "ddragon"
DDRAGON = "https://ddragon.leagueoflegends.com"

TRINKETS = {3340, 3363, 3364, 3330, 3513}
FOUNTAIN = {100: (560, 560), 200: (14280, 14340)}
RECALL_MS = 8000  # canalisation du retour à la base

# Objectifs épiques (règles du patch : à ajuster si Riot les change).
# Si un kill arrive avant l'heure théorique, l'apparition est avancée automatiquement.
DRAGON_PIT = (9866, 4414)
BARON_PIT = (5007, 10471)
DRAGON_FIRST, DRAGON_RESPAWN, ELDER_RESPAWN = 5 * 60000, 5 * 60000, 6 * 60000
GRUBS_FIRST, GRUBS_PER_WAVE, GRUBS_NEXT_WAVE, GRUBS_DESPAWN = 8 * 60000, 3, 4 * 60000, 14 * 60000 + 45000
HERALD_FIRST, HERALD_DESPAWN = 15 * 60000, 19 * 60000 + 45000
BARON_FIRST, BARON_RESPAWN = 20 * 60000, 6 * 60000
SOUL_TO_DRAGON = {"Mountain": "EARTH_DRAGON", "Ocean": "WATER_DRAGON", "Infernal": "FIRE_DRAGON",
                  "Cloud": "AIR_DRAGON", "Hextech": "HEXTECH_DRAGON", "Chemtech": "CHEMTECH_DRAGON"}

# Temps de mort de base (secondes) par niveau 1..18
DEATH_BRW = [10, 10, 12, 12, 14, 16, 20, 25, 28, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50, 52.5]


# --------------------------------------------------------------------------- #
# Data Dragon
# --------------------------------------------------------------------------- #
def http_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "lol-replay-viewer"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def cached_json(name: str, url: str):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / name
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    data = http_json(url)
    path.write_text(json.dumps(data), encoding="utf-8")
    return data


def pick_version(game_version: str, versions: list[str]) -> str:
    """Version DDragon correspondant au patch de la partie (ou la plus proche)."""
    major_minor = ".".join(game_version.split(".")[:2])
    for v in versions:  # versions triées de la plus récente à la plus ancienne
        if v.startswith(major_minor + "."):
            return v

    def key(v):
        try:
            return tuple(int(x) for x in v.split(".")[:2])
        except ValueError:
            return (0, 0)

    target = key(game_version)
    older = [v for v in versions if key(v) <= target and not v.startswith("lolpatch")]
    return older[0] if older else versions[0]


class DDragon:
    def __init__(self, version: str):
        self.version = version
        cdn = f"{DDRAGON}/cdn/{version}"
        champs = cached_json(f"champion_{version}.json", f"{cdn}/data/en_US/champion.json")["data"]
        self.champ_by_key = {int(c["key"]): c for c in champs.values()}
        spells = cached_json(f"summoner_{version}.json", f"{cdn}/data/en_US/summoner.json")["data"]
        self.spell_by_key = {int(s["key"]): s for s in spells.values()}
        runes = cached_json(f"runes_{version}.json", f"{cdn}/data/en_US/runesReforged.json")
        self.style_icon = {}
        self.perk = {}
        for style in runes:
            self.style_icon[style["id"]] = style["icon"]
            for slot in style["slots"]:
                for r in slot["runes"]:
                    self.perk[r["id"]] = (r["icon"], r["name"])
        self.items = cached_json(f"item_{version}.json", f"{cdn}/data/en_US/item.json")["data"]

    def item_name(self, item_id: int) -> str:
        it = self.items.get(str(item_id))
        return it["name"] if it else str(item_id)

    def item_into(self, item_id: int) -> list[int]:
        it = self.items.get(str(item_id))
        return [int(x) for x in it.get("into", [])] if it else []

    def champ(self, champ_id: int, fallback_name: str):
        c = self.champ_by_key.get(champ_id)
        cid = c["id"] if c else fallback_name
        name = c["name"] if c else fallback_name
        return name, f"{DDRAGON}/cdn/{self.version}/img/champion/{cid}.png"

    def spell(self, key: int):
        s = self.spell_by_key.get(key)
        if not s:
            return None
        return {"name": s["name"], "icon": f"{DDRAGON}/cdn/{self.version}/img/spell/{s['image']['full']}"}

    def rune(self, perk_id: int):
        p = self.perk.get(perk_id)
        if not p:
            return None
        return {"name": p[1], "icon": f"{DDRAGON}/cdn/img/{p[0]}"}

    def style(self, style_id: int):
        icon = self.style_icon.get(style_id)
        return {"icon": f"{DDRAGON}/cdn/img/{icon}"} if icon else None


# --------------------------------------------------------------------------- #
# Construction des données d'une partie
# --------------------------------------------------------------------------- #
def death_timer_ms(level: int, t_ms: int) -> int:
    brw = DEATH_BRW[max(1, min(18, level)) - 1]
    m = t_ms / 60000
    tif = 0.0
    if m >= 15:
        steps = int((min(m, 30) - 15) * 2 + 0.999)
        tif = steps * 0.00425
        if m >= 30:
            tif += int((min(m, 45) - 30) * 2 + 0.999) * 0.0030
        if m >= 45:
            tif += int((min(m, 55) - 45) * 2 + 0.999) * 0.0145
        tif = min(tif, 0.5)
    return int(brw * (1 + tif) * 1000)


def last_value(track, t, default):
    """track = liste triée de [t, valeur] → valeur à l'instant t."""
    i = bisect.bisect_right([p[0] for p in track], t) - 1
    return track[i][1] if i >= 0 else default


class Inventory:
    """Reconstruit l'inventaire d'un joueur à partir des événements d'items."""

    # Item support à quête : jamais "acheté", seulement détruit quand il évolue
    QUEST_CHAIN = {3865: 3866, 3866: 3867}
    QUEST_FINAL_FROM = 3867

    def __init__(self, dd: "DDragon" | None = None, final_items: list[int] | None = None):
        self.items: list[int] = []
        self.trinket: int | None = None
        self.history: list[tuple[int, str, int, list[int], int | None]] = []
        self.dd = dd
        self.final_items = final_items or []

    def _quest_next(self, item_id: int) -> int | None:
        if item_id in self.QUEST_CHAIN:
            return self.QUEST_CHAIN[item_id]
        if item_id == self.QUEST_FINAL_FROM and self.dd:
            into = self.dd.item_into(item_id)
            return next((i for i in self.final_items if i in into), into[0] if into else None)
        return None

    def _transform(self, old: int, new: int | None):
        if old in self.items:
            idx = self.items.index(old)
            if new:
                self.items[idx] = new
            else:
                self.items.pop(idx)
        elif new:
            self.items.insert(0, new)

    def _snap(self):
        return list(self.items), self.trinket

    def _remove(self, item_id: int) -> bool:
        if item_id in self.items:
            self.items.remove(item_id)
            return True
        if self.trinket == item_id:
            self.trinket = None
            return True
        return False

    def apply(self, ev: dict):
        typ, t = ev["type"], ev["timestamp"]
        before = self._snap()
        if typ == "ITEM_PURCHASED":
            iid = ev["itemId"]
            self.history.append((t, "buy", iid, *before))
            if iid in TRINKETS:
                self.trinket = iid
            else:
                self.items.append(iid)
        elif typ == "ITEM_DESTROYED" and self._quest_next(ev["itemId"]):
            self.history.append((t, "rm", ev["itemId"], *before))
            self._transform(ev["itemId"], self._quest_next(ev["itemId"]))
        elif typ in ("ITEM_DESTROYED", "ITEM_SOLD"):
            self.history.append((t, "rm", ev["itemId"], *before))
            self._remove(ev["itemId"])
        elif typ == "ITEM_UNDO":
            b, a = ev.get("beforeId", 0), ev.get("afterId", 0)
            if b:  # annulation d'un achat → on revient à l'état d'avant cet achat
                idx = next((i for i in range(len(self.history) - 1, -1, -1)
                            if self.history[i][1] == "buy" and self.history[i][2] == b), None)
                if idx is not None:
                    tp = self.history[idx][0]
                    first = idx
                    while first > 0 and self.history[first - 1][0] == tp:
                        first -= 1
                    _, _, _, items, trinket = self.history[first]
                    self.items, self.trinket = list(items), trinket
                    del self.history[first:]
                else:
                    self._remove(b)
            if a and not b:  # annulation d'une vente
                if a in TRINKETS:
                    self.trinket = a
                else:
                    self.items.append(a)

    def state(self):
        return [list(self.items), self.trinket]


def interp_track(track, t):
    if not track:
        return None
    times = [p[0] for p in track]
    k = bisect.bisect_right(times, t) - 1
    if k < 0:
        return track[0][1], track[0][2]
    if k >= len(track) - 1:
        return track[k][1], track[k][2]
    a, b = track[k], track[k + 1]
    f = (t - a[0]) / max(1, b[0] - a[0])
    return a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f


def infer_recalls(events, tracks, deaths, team_of):
    """Chaque passage en boutique hors respawn = un retour à la base.
    Le champion canalise RECALL_MS sur place, puis est téléporté à la fontaine
    et y reste jusqu'à son dernier achat. Modifie `tracks` en place."""
    shop_types = ("ITEM_PURCHASED", "ITEM_SOLD", "ITEM_UNDO")
    recalls = []
    for pid, track in tracks.items():
        times = sorted(e["timestamp"] for e in events
                       if e["type"] in shop_types and e.get("participantId") == pid)
        visits = []
        for ts in times:
            if visits and ts - visits[-1][1] < 25000:
                visits[-1][1] = ts
            else:
                visits.append([ts, ts])
        fx, fy = FOUNTAIN[team_of[pid]]
        for first, last in visits:
            if first < 75000:  # achats de début de partie
                continue
            # achat pendant la mort ou juste après le respawn : déjà à la fontaine
            if any(d0 <= first <= d1 + 45000 for d0, d1 in deaths[pid]):
                continue
            arrive = first - 1000
            start = arrive - RECALL_MS
            # ne pas chevaucher une mort / un retour précédent
            if any(d0 <= start <= d1 for d0, d1 in deaths[pid]):
                continue
            if recalls and recalls[-1]["pid"] == pid and start < recalls[-1]["leave"]:
                continue
            x, y = interp_track(track, start)
            leave = last + 1500
            track[:] = [p for p in track if not (start <= p[0] <= leave)]
            track.extend([[start, round(x), round(y)], [arrive - 1, round(x), round(y)],
                          [arrive, fx, fy], [leave, fx, fy]])
            track.sort(key=lambda p: p[0])
            # déjà à côté de la fontaine (rentré à pied) : pas d'animation
            if (x - fx) ** 2 + (y - fy) ** 2 > 2500 ** 2:
                recalls.append({"pid": pid, "t0": start, "t1": arrive, "leave": leave,
                                "x": round(x), "y": round(y)})
    recalls.sort(key=lambda r: r["t0"])
    return recalls


def monster_windows(objectives, souls, duration):
    """Intervalles [spawn, end) pendant lesquels chaque monstre épique est vivant."""
    out = []

    def kills(kind):
        return sorted((o for o in objectives if o["type"] == kind), key=lambda o: o["t"])

    def add(kind, sub, spawn, end, pos, **extra):
        end = min(end, duration)
        if spawn < end:
            out.append({"type": kind, "sub": sub, "spawn": spawn, "end": end,
                        "x": pos[0], "y": pos[1], **extra})

    # Dragons : élémentaires puis Ancien après l'âme
    drakes = kills("DRAGON")
    elem = [d["sub"] for d in drakes if d["sub"] != "ELDER_DRAGON"]
    # DRAGON_SOUL_GIVEN (teamId 0) annonce le type de la faille ; sinon le 3e dragon le donne
    rift_type = SOUL_TO_DRAGON.get(souls[0]["name"]) if souls else None
    rift_type = rift_type or (elem[2] if len(elem) >= 3 else None)
    spawn, elder = DRAGON_FIRST, False
    per_team = {}
    for d in drakes:
        add("DRAGON", d["sub"], min(spawn, d["t"] - 30000), d["t"], DRAGON_PIT)
        if d["sub"] != "ELDER_DRAGON":
            per_team[d["team"]] = per_team.get(d["team"], 0) + 1
        if d["sub"] == "ELDER_DRAGON" or per_team.get(d["team"], 0) >= 4:  # âme obtenue
            elder = True
        spawn = d["t"] + (ELDER_RESPAWN if elder else DRAGON_RESPAWN)
    add("DRAGON", "ELDER_DRAGON" if elder else rift_type, spawn, duration, DRAGON_PIT)

    # Larves du Néant : vagues de 3
    hordes = kills("HORDE")
    spawn, i = GRUBS_FIRST, 0
    while spawn < GRUBS_DESPAWN:
        wave = hordes[i:i + GRUBS_PER_WAVE]
        s = min(spawn, wave[0]["t"] - 30000) if wave else spawn
        full = len(wave) == GRUBS_PER_WAVE
        end = wave[-1]["t"] if full else GRUBS_DESPAWN
        add("HORDE", None, s, end, BARON_PIT, count=GRUBS_PER_WAVE, kills=[w["t"] for w in wave])
        if not full or len(hordes) <= i + GRUBS_PER_WAVE:  # pas de vague suivante dans les données
            break
        i += GRUBS_PER_WAVE
        spawn = end + GRUBS_NEXT_WAVE

    # Héraut
    heralds = kills("RIFTHERALD")
    if heralds:
        add("RIFTHERALD", None, min(HERALD_FIRST, heralds[0]["t"] - 30000), heralds[0]["t"], BARON_PIT)
    else:
        add("RIFTHERALD", None, HERALD_FIRST, HERALD_DESPAWN, BARON_PIT)

    # Baron Nashor
    spawn = BARON_FIRST
    for b in kills("BARON_NASHOR"):
        add("BARON_NASHOR", None, min(spawn, b["t"] - 30000), b["t"], BARON_PIT)
        spawn = b["t"] + BARON_RESPAWN
    add("BARON_NASHOR", None, spawn, duration, BARON_PIT)

    # Autres monstres (Atakhan, etc.) : affichés seulement s'ils ont été tués
    for o in objectives:
        if o["type"] not in ("DRAGON", "HORDE", "RIFTHERALD", "BARON_NASHOR"):
            add(o["type"], o.get("sub"), max(0, o["t"] - 60000), o["t"], (o["x"], o["y"]))
    return out


def build_game(match_path: Path, timeline_path: Path, versions: list[str]):
    match = json.loads(match_path.read_text(encoding="utf-8"))
    tl = json.loads(timeline_path.read_text(encoding="utf-8"))
    info, tinfo = match["info"], tl["info"]
    match_id = match["metadata"]["matchId"]

    version = pick_version(info["gameVersion"], versions)
    dd = _ddragon(version)

    duration = int(info["gameDuration"] * 1000) if info["gameDuration"] < 100000 else int(info["gameDuration"])
    frames = tinfo["frames"]
    events = [e for f in frames for e in f["events"]]
    events.sort(key=lambda e: e["timestamp"])
    game_end = next((e for e in events if e["type"] == "GAME_END"), None)
    if game_end:
        duration = game_end["timestamp"]

    pids = list(range(1, 11))
    team_of = {p["participantId"]: p["teamId"] for p in info["participants"]}

    # ---- Participants ---------------------------------------------------------
    participants = []
    for p in sorted(info["participants"], key=lambda p: p["participantId"]):
        champ_name, champ_icon = dd.champ(p["championId"], p["championName"])
        styles = p.get("perks", {}).get("styles", [])
        keystone = dd.rune(styles[0]["selections"][0]["perk"]) if styles else None
        secondary = dd.style(styles[1]["style"]) if len(styles) > 1 else None
        name = p.get("riotIdGameName") or p.get("summonerName") or champ_name
        participants.append({
            "pid": p["participantId"],
            "team": p["teamId"],
            "name": name,
            "tag": p.get("riotIdTagline", ""),
            "champ": champ_name,
            "champIcon": champ_icon,
            "position": p.get("teamPosition") or p.get("individualPosition") or "",
            "spells": [dd.spell(p["summoner1Id"]), dd.spell(p["summoner2Id"])],
            "keystone": keystone,
            "secondary": secondary,
            "final": {
                "k": p["kills"], "d": p["deaths"], "a": p["assists"],
                "cs": p["totalMinionsKilled"] + p["neutralMinionsKilled"],
                "gold": p["goldEarned"], "level": p["champLevel"],
                "items": [p[f"item{i}"] for i in range(6)], "trinket": p["item6"],
            },
        })

    # ---- Frames (gold / cs / xp) ----------------------------------------------
    frame_t = [f["timestamp"] for f in frames]
    gold = {pid: [] for pid in pids}
    cs = {pid: [] for pid in pids}
    for f in frames:
        for pid in pids:
            pf = f["participantFrames"].get(str(pid), {})
            gold[pid].append(pf.get("totalGold", 0))
            cs[pid].append(pf.get("minionsKilled", 0) + pf.get("jungleMinionsKilled", 0))

    # ---- Niveaux ---------------------------------------------------------------
    levels = {pid: [[0, 1]] for pid in pids}
    for e in events:
        if e["type"] == "LEVEL_UP" and e.get("participantId") in levels:
            levels[e["participantId"]].append([e["timestamp"], e["level"]])

    # ---- Kills / morts ----------------------------------------------------------
    kills, deaths = [], {pid: [] for pid in pids}
    for e in events:
        if e["type"] != "CHAMPION_KILL":
            continue
        v, t = e["victimId"], e["timestamp"]
        lvl = last_value(levels[v], t, 1)
        respawn = min(t + death_timer_ms(lvl, t), duration)
        deaths[v].append([t, respawn])
        pos = e.get("position", {})
        kills.append({
            "t": t, "x": pos.get("x", 0), "y": pos.get("y", 0),
            "killer": e.get("killerId", 0), "victim": v,
            "assists": e.get("assistingParticipantIds", []),
            "bounty": e.get("bounty", 0) + e.get("shutdownBounty", 0),
        })

    # ---- Objectifs, bâtiments, plaques -----------------------------------------
    objectives, buildings, plates, souls, specials = [], [], [], [], []
    for e in events:
        typ, t = e["type"], e["timestamp"]
        pos = e.get("position", {})
        if typ == "ELITE_MONSTER_KILL":
            team = e.get("killerTeamId") or team_of.get(e.get("killerId"), 0)
            objectives.append({
                "t": t, "type": e.get("monsterType"), "sub": e.get("monsterSubType"),
                "team": team, "killer": e.get("killerId", 0),
                "assists": e.get("assistingParticipantIds", []),
                "x": pos.get("x", 0), "y": pos.get("y", 0),
            })
        elif typ == "BUILDING_KILL":
            buildings.append({
                "t": t, "kind": e.get("buildingType"), "tower": e.get("towerType"),
                "lane": e.get("laneType"), "team": e.get("teamId"),
                "killer": e.get("killerId", 0), "assists": e.get("assistingParticipantIds", []),
                "x": pos.get("x", 0), "y": pos.get("y", 0),
            })
        elif typ == "TURRET_PLATE_DESTROYED":
            plates.append({"t": t, "team": e.get("teamId"), "lane": e.get("laneType"),
                           "killer": e.get("killerId", 0), "x": pos.get("x", 0), "y": pos.get("y", 0)})
        elif typ == "DRAGON_SOUL_GIVEN":
            souls.append({"t": t, "team": e.get("teamId"), "name": e.get("name")})
        elif typ == "CHAMPION_SPECIAL_KILL":
            specials.append({"t": t, "type": e.get("killType"), "killer": e.get("killerId", 0),
                             "multi": e.get("multiKillLength")})

    # ---- Positions (frames + positions connues via événements) ----------------
    raw = {pid: [] for pid in pids}
    for f in frames:
        for pid in pids:
            pf = f["participantFrames"].get(str(pid))
            if pf and "position" in pf:
                raw[pid].append((f["timestamp"], pf["position"]["x"], pf["position"]["y"], 1))
    for k in kills:
        raw[k["victim"]].append((k["t"], k["x"], k["y"], 3))
        for a in [k["killer"], *k["assists"]]:
            if a in raw:
                raw[a].append((k["t"], k["x"], k["y"], 2))
    for ev in objectives + buildings + plates:
        for a in [ev.get("killer", 0), *ev.get("assists", [])]:
            if a in raw:
                raw[a].append((ev["t"], ev["x"], ev["y"], 2))

    tracks = {}
    for pid in pids:
        dead = deaths[pid]
        pts = sorted(raw[pid], key=lambda p: (p[0], -p[3]))
        out = []
        for t, x, y, prio in pts:
            # pas de position pendant la mort (sauf le point exact de la mort)
            if any(d0 < t < d1 for d0, d1 in dead):
                continue
            if out and out[-1][0] == t:
                continue
            out.append([t, x, y])
        for d0, d1 in dead:
            fx, fy = FOUNTAIN[team_of[pid]]
            out.append([d1, fx, fy])
        out.sort(key=lambda p: p[0])
        tracks[pid] = out

    # ---- Retours à la base (déduits des achats : on n'achète qu'à la fontaine) --
    recalls = infer_recalls(events, tracks, deaths, team_of)

    # ---- Monstres épiques vivants ----------------------------------------------
    monsters = monster_windows(objectives, souls, duration)

    # ---- Inventaires ------------------------------------------------------------
    final_by_pid = {p["pid"]: p["final"]["items"] for p in participants}
    inv = {pid: Inventory(dd, final_by_pid[pid]) for pid in pids}
    items = {pid: [[0, [], None]] for pid in pids}
    # l'item support de départ n'apparaît pas comme achat du joueur : on le déduit
    for e in events:
        pid = e.get("participantId")
        if e["type"] == "ITEM_DESTROYED" and e.get("itemId") == 3865 and pid in inv:
            inv[pid].items = [3865]
            items[pid] = [[0, [3865], None]]
    for e in events:
        if e["type"] in ("ITEM_PURCHASED", "ITEM_DESTROYED", "ITEM_SOLD", "ITEM_UNDO"):
            pid = e.get("participantId")
            if pid not in inv:
                continue
            inv[pid].apply(e)
            st = inv[pid].state()
            if items[pid][-1][0] == e["timestamp"]:
                items[pid][-1] = [e["timestamp"], *st]
            else:
                items[pid].append([e["timestamp"], *st])

    # ---- Contrôles de cohérence ------------------------------------------------
    warnings = []
    for p in participants:
        pid = p["pid"]
        k = sum(1 for x in kills if x["killer"] == pid)
        d = len(deaths[pid])
        a = sum(1 for x in kills if pid in x["assists"])
        f = p["final"]
        if (k, d, a) != (f["k"], f["d"], f["a"]):
            warnings.append(f"  KDA {p['champ']}: timeline {k}/{d}/{a} vs match {f['k']}/{f['d']}/{f['a']}")
        got = sorted(i for i in items[pid][-1][1])
        exp = sorted(i for i in f["items"] if i)
        if got != exp:
            warnings.append(f"  Items {p['champ']}: timeline {got} vs match {exp}")
        # à la fin de la partie on force l'inventaire officiel (transformations d'items non tracées)
        items[pid].append([duration, [i for i in f["items"] if i], f["trinket"] or None])

    winner = next((t["teamId"] for t in info["teams"] if t.get("win")), None)
    game = {
        "id": match_id,
        "version": version,
        "gameVersion": info["gameVersion"],
        "mode": info.get("gameMode"),
        "queueId": info.get("queueId"),
        "start": info.get("gameStartTimestamp") or info.get("gameCreation"),
        "duration": duration,
        "winner": winner,
        "surrender": any(p.get("gameEndedInSurrender") or p.get("gameEndedInEarlySurrender")
                         for p in info["participants"]),
        "ddragon": f"{DDRAGON}/cdn/{version}",
        "participants": participants,
        "frameTimes": frame_t,
        "gold": gold,
        "cs": cs,
        "levels": levels,
        "tracks": tracks,
        "deaths": deaths,
        "items": items,
        "kills": kills,
        "objectives": objectives,
        "buildings": buildings,
        "plates": plates,
        "souls": souls,
        "recalls": recalls,
        "monsters": monsters,
        "specials": specials,
        "bans": {t["teamId"]: [b["championId"] for b in t.get("bans", [])] for t in info["teams"]},
        "itemNames": {str(i): dd.item_name(i)
                      for pid in pids for snap in items[pid] for i in [*snap[1], snap[2]] if i},
    }
    return game, warnings

# --------------------------------------------------------------------------- #
# Accès depuis le serveur
# --------------------------------------------------------------------------- #
_LOCK = threading.Lock()
_DD: "OrderedDict[str, DDragon]" = OrderedDict()   # 2 patchs gardés en mémoire au plus
_OUT: "OrderedDict[str, tuple[str, bytes]]" = OrderedDict()   # id -> (version des fichiers, JSON)
_VERSIONS: list[str] | None = None


def _versions():
    global _VERSIONS
    if _VERSIONS is None:
        try:   # liste rafraîchie au démarrage du serveur (nouveaux patchs)
            _VERSIONS = http_json(f"{DDRAGON}/api/versions.json")
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            (CACHE_DIR / "versions.json").write_text(json.dumps(_VERSIONS), encoding="utf-8")
        except Exception:
            _VERSIONS = json.loads((CACHE_DIR / "versions.json").read_text(encoding="utf-8"))
    return _VERSIONS


def _ddragon(version: str) -> DDragon:
    dd = _DD.get(version)
    if dd is None:
        dd = _DD[version] = DDragon(version)
        while len(_DD) > 2:
            _DD.popitem(last=False)
    _DD.move_to_end(version)
    return dd


def paths(match_id: str):
    """(match, timeline) de games/ ou None (id invalide, fichier absent)."""
    if not match_id or not all(c.isalnum() or c == "_" for c in match_id):
        return None
    m, tl = Path(GAMES) / f"{match_id}.json", Path(GAMES) / f"{match_id}_timeline.json"
    return (m, tl) if m.is_file() and tl.is_file() else None


def available() -> set[str]:
    """Ids des parties de games/ qui ont une timeline (donc rejouables)."""
    return {f[:-len("_timeline.json")] for f in os.listdir(GAMES) if f.endswith("_timeline.json")
            and os.path.isfile(os.path.join(GAMES, f[:-len("_timeline.json")] + ".json"))}


def game_json(match_id: str) -> bytes:
    """JSON compact d'une partie pour le viewer (5 dernières parties gardées en mémoire)."""
    p = paths(match_id)
    if not p:
        raise FileNotFoundError(f"Partie {match_id} introuvable (ou sans timeline) dans games/")
    key = "-".join(f"{os.stat(f).st_mtime_ns:x}" for f in p)
    with _LOCK:
        hit = _OUT.get(match_id)
        if hit and hit[0] == key:
            _OUT.move_to_end(match_id)
            return hit[1]
        game, _ = build_game(*p, _versions())
        body = json.dumps(game, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        _OUT[match_id] = (key, body)
        while len(_OUT) > 5:
            _OUT.popitem(last=False)
        return body
