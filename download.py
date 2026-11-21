#!/usr/bin/env python3
"""Télécharge les parties choisies (game + timeline) dans le dossier games/.

Clé API : fichier key.txt (la clé seule), sinon variable RIOT_API_KEY, ou --key (developer.riotgames.com).

Exemples :
  python download.py --player "Nom#TAG" --date 2026-11-21           # toutes ses games Clash (700) + 5c5 classé (710) ce jour-là
  python download.py --player "Nom#TAG" --date 2026-11-21 --list    # les affiche sans rien télécharger
  python download.py --player "Nom#TAG" --date 2026-11-21 --queue 420   # autre queue (remplace 700 et 710)
  python download.py EUW1_7123456789 --file matches.txt             # ou des matchId précis
Le jour est interprété dans le fuseau horaire de ton ordinateur.
Options : --region europe|americas|asia|sea (défaut europe), --queue N (répétable)
"""
import argparse, datetime, json, os, sys, time, urllib.parse
import requests  # pip install requests

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "games")
KEY = None

def clean(k):
    k = k.strip().strip("\ufeff").strip()
    if "=" in k:  # accepte API_KEY = "RGAPI-..." copié tel quel
        k = k.split("=", 1)[1]
    return k.strip().strip("'\"").strip()

def get_key(cli=None):
    p = os.path.join(BASE, "key.txt")
    if cli:
        k, src = cli, "--key"
    elif os.path.exists(p):
        k, src = open(p, encoding="utf-8-sig").read(), "key.txt"
    elif os.environ.get("RIOT_API_KEY"):
        k, src = os.environ["RIOT_API_KEY"], "variable RIOT_API_KEY"
    else:
        sys.exit("Clé API manquante : crée key.txt (la clé seule sur une ligne), ou utilise --key RGAPI-...")
    k = clean(k)
    return k

def api(region, path, params=None):
    url = f"https://{region}.api.riotgames.com{path}"
    params = {k: v for k, v in (params or {}).items() if v is not None}
    while True:
        r = requests.get(url, headers={"X-Riot-Token": KEY}, params=params, timeout=30)
        if r.status_code == 429:
            w = int(r.headers.get("Retry-After", "10")) + 1
            print(f"  limite atteinte, pause {w}s...")
            time.sleep(w)
            continue
        if r.status_code == 404:
            return None
        if r.status_code in (401, 403):
            sys.exit(f"Erreur {r.status_code} sur {path}\n{r.text[:300]}\n"
                     "Vérifie la clé affichée ci-dessus (clé expirée ? les clés de dev durent 24h).")
        r.raise_for_status()
        time.sleep(1.3)  # reste sous la limite des clés de dev (100 req / 2 min)
        return r.json()

def save(region, mid):
    for suffix, name in (("", f"{mid}.json"), ("/timeline", f"{mid}_timeline.json")):
        path = os.path.join(OUT, name)
        if os.path.exists(path):
            continue
        data = api(region, f"/lol/match/v5/matches/{mid}{suffix}")
        if data is None:
            print(f"  {name} : introuvable")
            continue
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    print(f"ok  {mid}")

def puuid_of(region, riot_id):
    name, _, tag = riot_id.partition("#")
    if not tag:
        sys.exit("Format attendu : Nom#TAG")
    a = api(region, f"/riot/account/v1/accounts/by-riot-id/{urllib.parse.quote(name)}/{urllib.parse.quote(tag)}")
    if not a:
        sys.exit("Joueur introuvable")
    return a["puuid"]

def main():
    global KEY
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--file")
    ap.add_argument("--player")
    ap.add_argument("--date", help="jour au format AAAA-MM-JJ")
    ap.add_argument("--queue", type=int, action="append", help="défaut : 700 (Clash) et 710 (5c5 classé)")
    ap.add_argument("--region", default="europe")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--key", help="clé API (sinon key.txt, sinon RIOT_API_KEY)")
    a = ap.parse_args()
    KEY = get_key(a.key)
    os.makedirs(OUT, exist_ok=True)
    ids = list(a.ids)
    if a.file:
        ids += [l.strip() for l in open(a.file, encoding="utf-8") if l.strip() and not l.startswith("//")]
    puuid = None
    if a.player:
        puuid = puuid_of(a.region, a.player)
        t0 = t1 = None
        if a.date:
            try:
                d = datetime.datetime.strptime(a.date, "%Y-%m-%d").astimezone()  # minuit, heure locale
            except ValueError:
                sys.exit("Date attendue au format AAAA-MM-JJ")
            t0 = int(d.timestamp())
            t1 = int((d + datetime.timedelta(days=1)).timestamp()) - 1
        for q in (a.queue or [700, 710]):
            start = 0
            while True:  # pagination par 100
                page = api(a.region, f"/lol/match/v5/matches/by-puuid/{puuid}/ids",
                           {"start": start, "count": 100, "queue": q, "startTime": t0, "endTime": t1}) or []
                ids += page
                if len(page) < 100:
                    break
                start += 100
        print(f"{len(set(ids))} partie(s) trouvée(s)")
    ids = list(dict.fromkeys(ids))
    if not ids:
        ap.print_help(); return
    if a.list:
        for mid in ids:
            m = api(a.region, f"/lol/match/v5/matches/{mid}")
            if not m: continue
            i = m["info"]
            me = next((p for p in i["participants"] if p["puuid"] == puuid), i["participants"][0])
            d = time.strftime("%d/%m/%Y %H:%M", time.localtime(i.get("gameCreation", 0) / 1000))
            print(f"{mid}  {d}  queue {i['queueId']:<5} {int(i['gameDuration']//60):>2} min  "
                  f"{me['championName']:<12} {me['kills']}/{me['deaths']}/{me['assists']}  {'V' if me['win'] else 'D'}")
        return
    for mid in ids:
        save(a.region, mid)

if __name__ == "__main__":
    main()
