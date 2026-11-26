#!/usr/bin/env python3
"""Met à jour le cache des parties SoloQ (420) et Flex (440) de la saison pour les joueurs de players.txt.

Pour chaque joueur et chaque queue, cache/<joueur>_<queue>.json garde :
  - la date de la dernière vérification
  - les stats de chaque partie déjà traitée (plus besoin de les retélécharger)
Les lancements suivants ne regardent que les parties jouées depuis la dernière vérification.

  python ranked.py                          # tous les joueurs, SoloQ + Flex
  python ranked.py --player "Nom#TAG"       # un seul joueur
  python ranked.py --queue 420              # une seule queue
  python ranked.py --limit 30               # au plus 30 nouvelles parties par joueur et par queue (reprise au lancement suivant)
Clé API : voir download.py (key.txt, RIOT_API_KEY ou --key). La « saison » = l'année civile en cours (--since AAAA-MM-JJ pour changer).
"""
import argparse, datetime, json, os, sys, time

import download as dl
import stats


def load(label, queue):
    p = stats.cache_path(label, queue)
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return {"puuid": None, "checked": 0, "games": {}, "skipped": []}


def save(label, queue, c):
    os.makedirs(stats.CACHE, exist_ok=True)
    tmp = stats.cache_path(label, queue) + ".tmp"
    json.dump(c, open(tmp, "w", encoding="utf-8"), ensure_ascii=False)
    os.replace(tmp, stats.cache_path(label, queue))


def update(label, queue, region, since_s, limit):
    c = load(label, queue)
    if not c["puuid"]:
        c["puuid"] = dl.puuid_of(region, label)
    since = max(since_s, c["checked"] - 86400)  # marge d'un jour ; les parties connues sont ignorées
    started = int(time.time())
    ids, start = [], 0
    while True:
        page = dl.api(region, f"/lol/match/v5/matches/by-puuid/{c['puuid']}/ids",
                      {"queue": queue, "startTime": int(since), "start": start, "count": 100}) or []
        ids += page
        if len(page) < 100:
            break
        start += 100
    new = [i for i in ids if i not in c["games"] and i not in c["skipped"]]
    todo = new[:limit] if limit else new
    print(f"{label} (queue {queue}) : {len(ids)} partie(s) depuis le {datetime.date.fromtimestamp(since)}, "
          f"{len(new)} nouvelle(s), {len(todo)} à traiter")
    for n, mid in enumerate(todo, 1):
        m = dl.api(region, f"/lol/match/v5/matches/{mid}")
        if not m:
            c["skipped"].append(mid)
            continue
        tl = dl.api(region, f"/lol/match/v5/matches/{mid}/timeline")
        a = stats.analyze(m, tl["info"]["frames"] if tl else [])
        idx = next((i for i, p in enumerate(a["P"]) if p["puuid"] == c["puuid"]), None) if a else None
        if idx is None:  # remake ou joueur introuvable
            c["skipped"].append(mid)
        else:
            c["games"][mid] = stats.make_row(mid, m["info"], a["P"][idx], a["stats"][idx])
        save(label, queue, c)  # sauvegarde à chaque partie : on peut interrompre et reprendre
        print(f"  {n}/{len(todo)} {mid}")
    if len(todo) == len(new):
        c["checked"] = started
    save(label, queue, c)
    print(f"  total en cache : {len(c['games'])} partie(s)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--player")
    ap.add_argument("--queue", type=int, choices=[q for _, q in stats.RANKED_QUEUES])
    ap.add_argument("--region", default="europe")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--since", help="AAAA-MM-JJ (défaut : 1er janvier de l'année en cours)")
    ap.add_argument("--key")
    a = ap.parse_args()
    dl.KEY = dl.get_key(a.key)
    if a.since:
        since = datetime.datetime.strptime(a.since, "%Y-%m-%d").timestamp()
    else:
        since = stats.season_start_ms() / 1000
    labels = [a.player] if a.player else [t[0] for t in stats.tracked()]
    if not labels:
        sys.exit("Aucun joueur dans players.txt")
    for label in labels:
        for _, q in stats.RANKED_QUEUES:
            if not a.queue or a.queue == q:
                update(label, q, a.region, since, a.limit)


if __name__ == "__main__":
    main()
