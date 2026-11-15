#!/usr/bin/env python3
"""Generic live-SERP probe for candidate construction-clone niches (commodity-vs-branded + weak-SERP test).
Flags: AIO, calc-giant, dominant niche-tool incumbent, forum. GREEN = weak niche field, no wall."""
import sys
from pathlib import Path
ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files"); sys.path.insert(0, str(ROOT/"tools"))
import niche_calculator_miner as m

CALCGIANT = {"omnicalculator.com","calculator.net","calculatorsoup.com","rapidtables.com",
             "inchcalculator.com","gigacalculator.com","vcalc.com","easycalculation.com"}
# known dominant niche-specific tools/communities = topical-authority walls
NICHE_TOOL = {"soapcalc.net","brambleberry.com","glazy.org","digitalfire.com","brewersfriend.com",
              "soapcalc.com","majesticmountainsage.com","brewersfriend.co"}
FORUM = {"reddit.com","quora.com","shroomery.org","reef2reef.com","beesource.com",
         "homebrewtalk.com","facebook.com","houzz.com"}

# (niche, core "how much" head)
HEADS = [
 ("Candle","candle wax calculator"),
 ("Candle-fragrance","fragrance oil calculator"),
 ("Soap","lye calculator"),
 ("Leather","leather square footage calculator"),
 ("Beekeeping","bee sugar syrup calculator"),
 ("MeatCuring","curing salt calculator"),
 ("PoultryFeed","chicken feed calculator"),
 ("Hydroponics","hydroponic nutrient calculator"),
 ("Balloon","balloon arch calculator"),
 ("Balloon-garland","balloon garland calculator"),
 ("Pottery","glaze calculator"),
 ("Mushroom","mushroom substrate calculator"),
 ("CushionFoam","cushion foam calculator"),
 ("CoverCrop","seeding rate calculator"),
 ("WindowTint","window tint calculator"),
 ("Greenhouse","greenhouse plastic calculator"),
]

cfg = m.Config(serp_load_async_ai_overview=True, serp_device="mobile")
api = m.DataForSEO(cfg)

def probe(kw):
    res = api.serp(kw); sl = m.compact_serp_slice(cfg, kw, res, None)
    items = res.get("items") or []
    above = []
    for it in items:
        if it.get("type") == "organic": break
        above.append(it.get("type"))
    aio = bool(sl["ai_overview"])
    top5 = [o["pld"] for o in sl["organic_top10"][:5]]
    cg = [p for p in top5 if p in CALCGIANT]
    nt = [p for p in top5 if p in NICHE_TOOL]
    fm = [p for p in top5 if p in FORUM]
    if aio and (cg or nt): v="RED"
    elif len(cg)>=2 or (nt and top5 and top5[0] in NICHE_TOOL): v="RED"
    elif aio or cg or nt or fm: v="AMBER"
    else: v="GREEN"
    return v, aio, above, top5, cg, nt, fm

print(f"{'VERD':6} {'AIO':3} flags                niche / query")
print("="*100)
from collections import Counter
vc=Counter()
for niche,kw in HEADS:
    try:
        v,aio,above,top5,cg,nt,fm = probe(kw)
    except Exception as e:
        print(f"ERR  {niche}: {str(e)[:50]}"); continue
    vc[v]+=1
    flags=[]
    if cg: flags.append(f"calcgiant={','.join(cg)}")
    if nt: flags.append(f"NICHE-TOOL={','.join(nt)}")
    if fm: flags.append(f"forum={','.join(fm)}")
    print(f"{v:6} {('Y' if aio else '-'):3} {niche:16} {kw}")
    print(f"           above:{above or '#1 organic'}  flags:{'; '.join(flags) or 'none'}")
    print(f"           top5: {', '.join(top5)}")
print("\nTALLY:",dict(vc))
