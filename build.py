#!/usr/bin/env python3
"""Génère site/data.json pour héberger le site comme simple site statique."""
import json, os, shutil
from stats import build, BASE
json.dump(build(), open(os.path.join(BASE, "site", "data.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("site/data.json généré")
for src, dst in [("blindability_data.json", "blindability.json"), ("pool_advice.json", "pool_advice.json")]:
    src = os.path.join(BASE, "percentiles", "data", src)
    if os.path.isfile(src):
        shutil.copy(src, os.path.join(BASE, "site", dst))
        print("site/" + dst + " copié")

# données du visualiseur de parties (onglet Replay) : site/replays/<ID>.json
import replay
os.makedirs(os.path.join(BASE, "site", "replays"), exist_ok=True)
for mid in sorted(replay.available()):
    with open(os.path.join(BASE, "site", "replays", mid + ".json"), "wb") as f:
        f.write(replay.game_json(mid))
print(len(replay.available()), "partie(s) écrite(s) dans site/replays/")
