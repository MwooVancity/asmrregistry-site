#!/usr/bin/env python3
"""Live-SERP validation of the conversion.csv GREEN 'open' heads (HARD RULE: SERP-check before any winnability opinion).
Ahrefs flags AIO/KnowledgeCard but NOT calc-giant organic dominance. Pull live US/mobile SERP for the
top survivor heads and label by what actually renders."""
import sys, json
from pathlib import Path
ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files"); sys.path.insert(0, str(ROOT/"tools"))
import niche_calculator_miner as m

GIANTS = {"calculator.net","omnicalculator.com","calculatorsoup.com","inchcalculator.com",
          "gigacalculator.com","thecalculatorsite.com","rapidtables.com","easycalculation.com",
          "unitconverters.net","metric-conversions.org","convertunits.com","calculateme.com",
          "checkyourmath.com","conversion-metric.org","wikipedia.org","google.com"}

# Top GREEN 'open' survivor heads across hubs (the actual build candidates)
HEADS = ["board foot calculator","steps to miles calculator","inches to decimal","btu calculator",
         "surface area calculator","metric to inches","mm to fraction","cubic feet to square feet",
         "horsepower calculator","120 grams to cups","mg to ml calculator","treadmill speed to pace",
         "5 gallons to pounds","inch lbs to ft lbs","what is 32kg in pounds"]

cfg = m.Config(serp_load_async_ai_overview=True, serp_device="mobile")
api = m.DataForSEO(cfg)
out=[]
for kw in HEADS:
    try:
        res = api.serp(kw)
        sl = m.compact_serp_slice(cfg, kw, res, None)
    except Exception as e:
        out.append((kw,"ERR",str(e)[:60],[],False,False,False)); continue
    aio = bool(sl["ai_overview"])
    w = sl["widgets"]
    box = any(w.get(t) for t in ("currency_box","math_solver","google_finance"))
    paa = w.get("people_also_ask"); disc = w.get("discussions_and_forums")
    top5 = [o["pld"] for o in sl["organic_top10"][:5]]
    g5 = [p for p in top5 if p in GIANTS]
    # verdict
    if aio and g5: v="RED"
    elif len(g5)>=2 or box: v="RED"
    elif aio or len(g5)==1 or disc: v="AMBER"
    else: v="GREEN"
    out.append((kw,v,"aio="+("Y" if aio else "n")+(" box" if box else ""),top5,aio,bool(g5),disc))

print(f"{'VERDICT':7} {'AIO':3} {'giants/top5':11}  keyword  -> top5 PLDs")
print("="*100)
from collections import Counter
vc=Counter()
for kw,v,note,top5,aio,hasg,disc in out:
    vc[v]+=1
    g=sum(1 for p in top5 if p in GIANTS)
    print(f"{v:7} {('Y' if aio else '-'):3} {g}/{len(top5):<9}  {kw:28} -> {', '.join(top5)}")
print("\nTALLY:",dict(vc))
Path(ROOT/"out"/"conversion_serp_check.json").write_text(json.dumps(
  [{"kw":kw,"verdict":v,"note":note,"top5":top5} for kw,v,note,top5,aio,hasg,disc in out],indent=2))
print("-> out/conversion_serp_check.json")
