#!/usr/bin/env python3
"""Live-SERP probe: is welding a construction-clone (weak niche SERP) or manufacturer-authority walled?
Split the heads into CONTEXTUAL calcs (filler/gas/cost/weight) vs CHART/SETTINGS lookups."""
import sys
from pathlib import Path
ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files"); sys.path.insert(0, str(ROOT/"tools"))
import niche_calculator_miner as m

MFR = {"millerwelds.com","lincolnelectric.com","esab.com","hobartbrothers.com","hobartwelders.com",
       "fronius.com","kobelco.com","weldingsupply.com","cyberweld.com"}
CALCGIANT = {"omnicalculator.com","calculator.net","calculatorsoup.com","rapidtables.com","inchcalculator.com"}
FORUM = {"weldingweb.com","reddit.com","quora.com","practicalmachinist.com"}

CONTEXTUAL = ["welding cost calculator","weld metal calculator","filler metal calculator",
              "welding gas consumption calculator","wire feed speed calculator","weld weight calculator",
              "deposition rate calculator"]
CHART = ["mig welding settings chart","welding amperage chart","stick welding rod chart",
         "tig welding amperage chart","welding rod amperage chart"]

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
    mfr = [p for p in top5 if p in MFR]; cg = [p for p in top5 if p in CALCGIANT]
    fm = [p for p in top5 if p in FORUM]
    # construction-clone = weak niche field: no calc-giant, <=1 manufacturer, no AIO
    if aio and (mfr or cg): v="RED"
    elif cg or len(mfr)>=2: v="RED"
    elif aio or len(mfr)==1 or fm: v="AMBER"
    else: v="GREEN"
    return v, aio, above, top5, mfr, cg

for label, group in [("CONTEXTUAL CALCS (the money shape)", CONTEXTUAL), ("CHART / SETTINGS lookups", CHART)]:
    print(f"\n{'='*94}\n{label}\n{'='*94}")
    for kw in group:
        try:
            v,aio,above,top5,mfr,cg = probe(kw)
        except Exception as e:
            print(f"  ERR {kw}: {str(e)[:60]}"); continue
        tag = f"mfr={len(mfr)} cg={len(cg)} aio={'Y' if aio else '-'}"
        print(f"  {v:6} [{tag}]  {kw}")
        print(f"         above-organic: {above or '(organic #1)'}")
        print(f"         top5: {', '.join(top5)}")
