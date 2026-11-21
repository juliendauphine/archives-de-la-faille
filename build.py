#!/usr/bin/env python3
"""Génère site/data.json pour héberger le site comme simple site statique."""
import json, os
from stats import build, BASE
json.dump(build(), open(os.path.join(BASE, "site", "data.json"), "w", encoding="utf-8"), ensure_ascii=False)
print("site/data.json généré")
