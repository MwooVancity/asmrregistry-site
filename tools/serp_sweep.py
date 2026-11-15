#!/usr/bin/env python3
"""Live SERP winnability sweep for the construction corpus (HARD RULE: SERP-check every head).

For each of the ~250 page heads (demand>=10, distinct; KD NOT used as a gate):
  - pull live google SERP (US/mobile, async AIO) via the proven miner client
  - record: AIO present?, forum/discussions present?, featured snippet?, top-10 PLDs, calc-giants
  - then bulk-fetch DataForSEO domain rank for every incumbent domain (real authority, not KD)
Verdict per head from the RENDERED serp (signals are stored raw so the label is auditable):
  RED   = AIO present AND a calc-giant in top5;  OR >=2 calc-giants top5;  OR top5 all rank>=500
  AMBER = AIO present;  OR 1 calc-giant top5;  OR forum in top3;  OR >=3 of top5 rank>=450
  GREEN = none of the above (no AIO, no calc-giant top5, weak field)
Resumable: every SERP slice cached to out/serp_cache/<hash>.json -> re-runs are free.
"""
from __future__ import annotations
import csv, re, json, sys, hashlib, time
from pathlib import Path
from collections import defaultdict

ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files")
sys.path.insert(0, str(ROOT / "tools"))
# load DATAFORSEO_B64 from muniengine/.env BEFORE importing the client
import os
envf = ROOT / "muniengine" / ".env"
for line in envf.read_text(encoding="utf-8", errors="ignore").splitlines():
    line = line.strip()
    if line.startswith("DATAFORSEO_B64="):
        os.environ["DATAFORSEO_B64"] = line.split("=", 1)[1].strip()

from niche_calculator_miner import Config, DataForSEO, compact_serp_slice  # noqa: E402

SRC = r"C:\Users\mwoo7\Downloads\google_us_calc-calculator-char_matching-terms_2026-06-06_15-29-07.csv"
CACHE = ROOT / "out" / "serp_cache"; CACHE.mkdir(parents=True, exist_ok=True)
OUT = ROOT / "out" / "construction_serp_verdicts.csv"
FLOOR = 10

SPECIALIST = {  # purpose-built calculator giants with topical authority = the real walls
 "calculator.net","omnicalculator.com","calculatorsoup.com","inchcalculator.com",
 "gigacalculator.com","thecalculatorsite.com","rapidtables.com","easycalculation.com",
 "calculator-online.net","calculatored.com","vcalc.com","blocklayer.com","spikevm.com",
 "mycalculator.com","calculate.plus","calcunation.com","sciencing.com","omnicalculator",
 "landscapecalculator.com","constructioncalc.com",
}
BIGBOX = {  # high-DR general sites whose per-query calc widget is thin & beatable (NOT a wall)
 "homedepot.com","lowes.com","menards.com","concretenetwork.com","thespruce.com",
 "bobvila.com","familyhandyman.com","hunker.com","angi.com","houzz.com","build.com",
 "wikihow.com","forbes.com","thisoldhouse.com","hgtv.com",
}
FORUM_PLDS = {"reddit.com","quora.com","houzz.com","contractortalk.com","diychatroom.com",
 "doityourself.com","city-data.com","houzz.com","stackexchange.com","forum"}

HARD={'ai overview','sitelinks','top stories','shopping','shopping ads','knowledge card','knowledge panel'}
SCHOOL=re.compile(r"""
  \bgrading\s+(calculator|chart|scale|curve|app|system|software|sheet)|online\s+grading
  |(diamond|coin|embryo|card|psa|meat|beef|gem|stamp)\s+grading|grading\s+on\s+a\s+curve
  | kid\s+rock | the\s+rock | dwayne | halftime | grammy | amphitheat | seating\s+chart
  | billboard | rock\s+(chart|lose|band|concert|halftime|hall) | red\s+rock
  | rosetta | duolingo
  | h&r | \bhr\s+block | \btax\b | order\s+block | \btrading\b | stock\s+market | crypto | bitcoin
  | zodiac | astrology | tarot | horoscope | poker | guitar
""", re.I | re.X)
def num(x):
    x=(x or '').replace(',','').strip()
    try:return float(x)
    except:return 0.0
def feats(s):return {t.strip().lower() for t in (s or '').split(',') if t.strip()}

# ---- build the head set (floor>=10, distinct n>=2 OR dem>=300; KD NOT a gate) ----
rows=[]
with open(SRC,encoding='utf-16') as f:
    for r in csv.DictReader(f,delimiter='\t'):
        kw=(r.get('Keyword') or '').strip()
        if not kw:continue
        il=(r.get('Intents') or '').lower();fs=feats(r.get('SERP Features'))
        red=(HARD&fs) or ('branded' in il and 'non-branded' not in il) or re.search(r'(?<!non-)\bnavigational\b',il) or (re.search(r'(?<!non-)\blocal\b',il) and 'non-local' not in il) or SCHOOL.search(kw)
        rows.append({'kw':kw,'parent':(r.get('Parent Keyword') or kw).strip(),'vol':int(num(r.get('Volume'))),'kd':int(num(r.get('Difficulty'))),'red':bool(red)})
pages=defaultdict(list)
for r in rows:pages[r['parent']].append(r)
heads=[]
for par,m in pages.items():
    g=[x for x in m if not x['red']]
    if not g:continue
    g.sort(key=lambda x:-x['vol'])
    dem=sum(x['vol'] for x in g)
    if dem<FLOOR:continue
    if not(len(g)>=2 or dem>=300):continue
    heads.append({'head':g[0]['kw'],'parent':par,'demand':dem,'kd':g[0]['kd'],'mink':min(x['kd'] for x in g),'n':len(g)})
heads.sort(key=lambda h:-h['demand'])
print(f"sweeping {len(heads)} heads (demand>=10, distinct; KD not a gate)",flush=True)

cfg=Config()
client=DataForSEO(cfg)

def cache_path(kw): return CACHE / (hashlib.md5(kw.encode()).hexdigest()+".json")

slices={}
for i,h in enumerate(heads,1):
    kw=h['head']; cp=cache_path(kw)
    if cp.exists():
        slices[kw]=json.loads(cp.read_text(encoding="utf-8")); continue
    try:
        raw=client.serp(kw)
        sl=compact_serp_slice(cfg, kw, raw, h['kd'])
        cp.write_text(json.dumps(sl), encoding="utf-8")
        slices[kw]=sl
    except Exception as e:
        slices[kw]={"keyword":kw,"error":str(e)}
    if i%10==0:
        print(f"  {i}/{len(heads)}  (${client.total_cost:.3f})",flush=True)
print(f"serp done; cost ${client.total_cost:.3f}",flush=True)

# ---- bulk domain rank for every incumbent in any top-10 ----
def pld(d):
    d=(d or "").lower()
    return d[4:] if d.startswith("www.") else d
alldoms=set()
for sl in slices.values():
    for o in (sl.get("organic_top10") or []):
        if o.get("pld"): alldoms.add(pld(o["pld"]))
alldoms=sorted(alldoms)
etvmap={}  # domain -> estimated organic traffic value (authority proxy; Labs, not Backlinks)
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

BEAT=300_000      # etv below this = a beatable slot a DR~0 site can realistically take
STRONG=3_000_000  # etv above this = a strong incumbent (calc-giant or big brand) holding a slot
def verdict(sl):
    if sl.get("error"): return "ERR",sl["error"][:40],{}
    top=[pld(o.get("pld")) for o in (sl.get("organic_top10") or []) if o.get("pld")]
    top5=top[:5]
    aio=bool(sl.get("ai_overview"))
    forum3=any(d in FORUM_PLDS for d in top[:3])
    etvs5=[etvmap.get(d,0) for d in top5]
    strong5=sum(1 for e in etvs5 if e>=STRONG)   # giants/big brands holding a top-5 slot
    open5  =sum(1 for e in etvs5 if e< BEAT)      # weak sites already ranking = beatable slots
    sig={"aio":aio,"strong5":strong5,"open5":open5,"forum_top3":forum3,
         "min_etv_k":round(min(etvs5)/1000) if etvs5 else 0,"top5":top5}
    # RED: no beatable slot at all, 3+ giants own the page, or AIO sitting on a strong field
    if open5==0 or strong5>=3 or (aio and strong5>=2):
        return "RED",("owned-field" if open5==0 else ("giant-wall" if strong5>=3 else "aio-wall")),sig
    # AMBER: AIO present, forum in top3, two giants present, or only one open slot
    if aio or forum3 or strong5==2 or open5==1:
        return "AMBER",("aio" if aio else ("forum" if forum3 else ("two-giants" if strong5==2 else "tight"))),sig
    # GREEN: no AIO, no forum, <=1 giant, and >=2 beatable slots held by weak sites
    return "GREEN","open-field",sig

out=[]
for h in heads:
    sl=slices.get(h['head'],{})
    v,reason,sig=verdict(sl)
    out.append({**h,"verdict":v,"reason":reason,**{f"sig_{k}":(json.dumps(val) if k=='top5' else val) for k,val in sig.items()}})

OUT.parent.mkdir(parents=True,exist_ok=True)
cols=["verdict","reason","head","demand","kd","mink","n","sig_aio","sig_strong5","sig_open5","sig_forum_top3","sig_min_etv_k","sig_top5","parent"]
order={"GREEN":0,"AMBER":1,"RED":2,"ERR":3}
out.sort(key=lambda r:(order.get(r["verdict"],9),-r["demand"]))
with open(OUT,"w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f,fieldnames=cols,extrasaction="ignore");w.writeheader()
    for r in out:w.writerow(r)

vc=defaultdict(int); vd=defaultdict(int)
for r in out:
    vc[r["verdict"]]+=1; vd[r["verdict"]]+=r["demand"]
print("\n==== VERDICTS (rendered SERP, not KD) ====")
for v in ("GREEN","AMBER","RED","ERR"):
    if vc[v]:print(f"  {v:<6} {vc[v]:>4} pages   {vd[v]:>8,} demand")
print(f"\nwritten -> {OUT}")
print("\n--- TOP 25 GREEN (SERP-verified) ---")
for r in [r for r in out if r['verdict']=='GREEN'][:25]:
    print(f"  dem{r['demand']:>6} kd{r['kd']:>2} minETV{r['sig_min_etv_k']:>5}k  {r['head']}")
