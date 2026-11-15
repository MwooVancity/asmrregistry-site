#!/usr/bin/env python3
"""Live SERP winnability sweep for the MATH corpus (HARD RULE: SERP-check every head).

Clone of serp_sweep.py adapted for math. Heads are read straight from out/math_buildlist.csv
(already positive-gated + denylisted by analyze_math.py), top N by demand — the money heads KD
called "easy". For each head: live google SERP (US/mobile, async AIO) via the proven miner client,
then bulk DataForSEO traffic estimation for every incumbent domain (real authority, not KD).

The math walls differ from construction: purpose-built calc/solver giants (Symbolab, Mathway,
Desmos, Wolfram, Photomath, Calculator.net, GeoGebra) AND homework-UGC giants (Chegg, CourseHero,
Brainly, Quizlet) own the "how to find X" SERPs. Both are treated as walls.
Resumable: every SERP slice cached to out/serp_cache_math/<hash>.json.
"""
from __future__ import annotations
import csv, json, sys, hashlib
from pathlib import Path
from collections import defaultdict

ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files")
sys.path.insert(0, str(ROOT / "tools"))
import os
envf = ROOT / "muniengine" / ".env"
for line in envf.read_text(encoding="utf-8", errors="ignore").splitlines():
    line = line.strip()
    if line.startswith("DATAFORSEO_B64="):
        os.environ["DATAFORSEO_B64"] = line.split("=", 1)[1].strip()

from niche_calculator_miner import Config, DataForSEO, compact_serp_slice  # noqa: E402

BUILDLIST = ROOT / "out" / "math_buildlist.csv"
CACHE = ROOT / "out" / "serp_cache_math"; CACHE.mkdir(parents=True, exist_ok=True)
OUT = ROOT / "out" / "math_serp_verdicts.csv"
TOP_N = int(sys.argv[1]) if len(sys.argv) > 1 else 40

SPECIALIST = {  # purpose-built calculator/solver giants = the real walls in math
 "symbolab.com","mathway.com","desmos.com","wolframalpha.com","wolfram.com","photomath.com",
 "calculator.net","calculatorsoup.com","omnicalculator.com","geogebra.org","cuemath.com",
 "mathsisfun.com","khanacademy.org","byjus.com","rapidtables.com","calculator-online.net",
 "emathhelp.net","calcworkshop.com","mathportal.org","dcode.fr","miniwebtool.com",
 "gigacalculator.com","easycalculation.com","calculatored.com","vcalc.com","mathpapa.com",
 "calculatorway.com","goodcalculators.com","inchcalculator.com","percentagecalculator.net",
}
UGC = {  # homework-help UGC giants own "how to" math SERPs; same wall function as forums
 "chegg.com","coursehero.com","brainly.com","brainly.in","quizlet.com","studocu.com",
 "reddit.com","quora.com","numerade.com","studypug.com","gauthmath.com","socratic.org",
 "stackexchange.com","math.stackexchange.com","tiktok.com","youtube.com",
}

def num(x):
    x=(x or '').replace(',','').strip()
    try:return float(x)
    except:return 0.0

# ---- head set: top-N distinct heads by demand from the gated build list ----
seen=set(); heads=[]
for r in csv.DictReader(open(BUILDLIST,encoding='utf-8')):
    h=r['head_kw'].strip()
    if h in seen: continue
    seen.add(h)
    heads.append({'head':h,'parent':r['parent'],'demand':int(r['demand']),
                  'kd':int(r['head_kd']),'mink':int(r['min_kd']),'n':int(r['n_kw']),
                  'hub':r['hub'],'static':r['tier']})
heads.sort(key=lambda h:-h['demand'])
heads=heads[:TOP_N]
print(f"sweeping top {len(heads)} math heads by demand (static tier ignored; rendered SERP is the verdict)",flush=True)

cfg=Config(); client=DataForSEO(cfg)
def cache_path(kw): return CACHE / (hashlib.md5(kw.encode()).hexdigest()+".json")

slices={}
for i,h in enumerate(heads,1):
    kw=h['head']; cp=cache_path(kw)
    if cp.exists(): slices[kw]=json.loads(cp.read_text(encoding="utf-8")); continue
    try:
        raw=client.serp(kw); sl=compact_serp_slice(cfg, kw, raw, h['kd'])
        cp.write_text(json.dumps(sl), encoding="utf-8"); slices[kw]=sl
    except Exception as e:
        slices[kw]={"keyword":kw,"error":str(e)}
    if i%10==0: print(f"  {i}/{len(heads)}  (${client.total_cost:.3f})",flush=True)
print(f"serp done; cost ${client.total_cost:.3f}",flush=True)

def pld(d):
    d=(d or "").lower(); return d[4:] if d.startswith("www.") else d
alldoms=set()
for sl in slices.values():
    for o in (sl.get("organic_top10") or []):
        if o.get("pld"): alldoms.add(pld(o["pld"]))
alldoms=sorted(alldoms)
etvmap={}
for j in range(0,len(alldoms),700):
    chunk=alldoms[j:j+700]
    try:
        resp=client._post("dataforseo_labs/google/bulk_traffic_estimation/live",
                          [{"targets":chunk,"location_code":2840,"language_code":"en"}])
        t=client._task0(resp)
        for it in (t.get("result") or [{}])[0].get("items") or []:
            m=(it.get("metrics") or {}).get("organic") or {}
            etvmap[pld(it.get("target"))]=m.get("etv") or 0
    except Exception as e:
        print("traffic_est error:",e,flush=True)
print(f"authority for {len(etvmap)} domains; total cost ${client.total_cost:.3f}",flush=True)

BEAT=300_000
def verdict(sl):
    if sl.get("error"): return "ERR",sl["error"][:40],{}
    top=[pld(o.get("pld")) for o in (sl.get("organic_top10") or []) if o.get("pld")]
    top5=top[:5]; aio=bool(sl.get("ai_overview"))
    spec5=[d for d in top5 if d in SPECIALIST]
    ugc3=any(d in UGC for d in top[:3])
    open_slots=sum(1 for d in top5 if d not in SPECIALIST and etvmap.get(d,0) < BEAT)
    etvs5=[etvmap.get(d,0) for d in top5]
    sig={"aio":aio,"spec5":len(spec5),"ugc_top3":ugc3,"open_slots":open_slots,
         "min_etv_k":round(min(etvs5)/1000) if etvs5 else 0,"top5":top5}
    if len(spec5)>=2 or (aio and spec5) or open_slots==0:
        return "RED",("specialist-wall" if len(spec5)>=2 else ("aio-wall" if aio else "owned-field")),sig
    if len(spec5)==1 or aio or ugc3 or open_slots==1:
        return "AMBER",("specialist" if spec5 else ("aio" if aio else ("ugc" if ugc3 else "tight"))),sig
    return "GREEN","open-field",sig

out=[]
for h in heads:
    sl=slices.get(h['head'],{}); v,reason,sig=verdict(sl)
    out.append({**h,"verdict":v,"reason":reason,**{f"sig_{k}":(json.dumps(val) if k=='top5' else val) for k,val in sig.items()}})

OUT.parent.mkdir(parents=True,exist_ok=True)
cols=["verdict","reason","head","hub","static","demand","kd","mink","n","sig_aio","sig_spec5","sig_ugc_top3","sig_open_slots","sig_min_etv_k","sig_top5","parent"]
order={"GREEN":0,"AMBER":1,"RED":2,"ERR":3}
out.sort(key=lambda r:(order.get(r["verdict"],9),-r["demand"]))
with open(OUT,"w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f,fieldnames=cols,extrasaction="ignore"); w.writeheader()
    for r in out: w.writerow(r)

vc=defaultdict(int); vd=defaultdict(int)
for r in out: vc[r["verdict"]]+=1; vd[r["verdict"]]+=r["demand"]
print("\n==== MATH VERDICTS (rendered SERP, not KD) ====")
for v in ("GREEN","AMBER","RED","ERR"):
    if vc[v]: print(f"  {v:<6} {vc[v]:>4} heads   {vd[v]:>9,} demand")
print(f"\nwritten -> {OUT}")
for grp in ("GREEN","AMBER"):
    g=[r for r in out if r['verdict']==grp]
    if not g: continue
    print(f"\n--- {grp} (SERP-verified) ---")
    for r in g[:30]:
        print(f"  dem{r['demand']:>6} kd{r['kd']:>2} spec{r['sig_spec5']} aio{int(r['sig_aio'])} open{r['sig_open_slots']} minETV{r['sig_min_etv_k']:>5}k | {r['head']}")
print("\n--- RED head sample (the calc-giant/AIO wall KD hid) ---")
for r in [r for r in out if r['verdict']=='RED'][:15]:
    print(f"  dem{r['demand']:>6} kd{r['kd']:>2} [{r['reason']:14}] {r['head']:32.32} top5={json.loads(r['sig_top5'])[:3]}")
