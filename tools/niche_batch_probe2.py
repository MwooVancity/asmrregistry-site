#!/usr/bin/env python3
"""Round 2 probe — the NET-NEW candidates from the ChatGPT brainstorm not already validated."""
import sys
from pathlib import Path
ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files"); sys.path.insert(0, str(ROOT/"tools"))
import niche_batch_probe as p  # reuse probe() + classifiers

HEADS = [
 ("ArtificialTurf","artificial turf infill calculator"),
 ("LandscapeFabric","landscape fabric calculator"),
 ("Terrarium","terrarium substrate calculator"),
 ("Reptile","reptile substrate calculator"),
 ("RaisedBedSoil","raised garden bed soil calculator"),
 ("ModelRailroad","model railroad ballast calculator"),
 ("JewelryCasting","lost wax casting calculator"),
 ("CoffeeRoast","coffee roasting loss calculator"),
]

print(f"{'VERD':6} {'AIO':3} niche / query")
print("="*100)
from collections import Counter
vc=Counter()
for niche,kw in HEADS:
    try:
        v,aio,above,top5,cg,nt,fm = p.probe(kw)
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
