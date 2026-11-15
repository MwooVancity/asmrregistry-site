#!/usr/bin/env python3
"""Probe the REAL wall on pure unit-conversions vs contextual calculators.
Question: 'calculator.net only has 312 pages — can't we outrank them on specific queries?'
Test: for each head, dump (a) what Google renders ABOVE organic (item_types + AIO),
(b) whether calculator.net is even present, (c) top3 organic. The thesis to falsify:
on PURE conversions the click is taken by a Google widget regardless of who ranks #1."""
import sys
from pathlib import Path
ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files"); sys.path.insert(0, str(ROOT/"tools"))
import niche_calculator_miner as m

PURE = ["how many ounces in a quart","grams to cups","mm to inches","150 lbs to kg",
        "5mm to inches","how many oz in a gallon","cups to grams","kg to lbs"]
CONTEXTUAL = ["board foot calculator","btu calculator","horsepower calculator","pool volume calculator"]

cfg = m.Config(serp_load_async_ai_overview=True, serp_device="mobile")
api = m.DataForSEO(cfg)

def probe(kw):
    res = api.serp(kw); sl = m.compact_serp_slice(cfg, kw, res, None)
    items = res.get("items") or []
    types = [it.get("type") for it in items if it.get("type")]
    # what renders before the first organic result?
    above = []
    for it in items:
        if it.get("type") == "organic": break
        above.append(it.get("type"))
    aio = bool(sl["ai_overview"])
    top = [(o["rank_absolute"], o["pld"]) for o in sl["organic_top10"][:3]]
    calcnet = any(o["pld"] == "calculator.net" for o in sl["organic_top10"])
    return above, aio, calcnet, top, sorted(set(types))

for label, group in [("PURE UNIT CONVERSIONS", PURE), ("CONTEXTUAL CALCULATORS", CONTEXTUAL)]:
    print(f"\n{'='*92}\n{label}\n{'='*92}")
    for kw in group:
        try:
            above, aio, calcnet, top, types = probe(kw)
        except Exception as e:
            print(f"  ERR {kw}: {str(e)[:60]}"); continue
        print(f"\n  {kw}")
        print(f"    renders ABOVE 1st organic : {above or '(nothing — organic is #1)'}")
        print(f"    AI Overview present       : {'YES' if aio else 'no'}")
        print(f"    calculator.net in top10   : {'YES' if calcnet else 'NO — not even ranking'}")
        print(f"    top3 organic              : {top}")
