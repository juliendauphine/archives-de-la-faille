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
