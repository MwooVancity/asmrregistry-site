#!/usr/bin/env python3
"""Classify the construction.csv Ahrefs net into a per-sub-hub build blueprint for a DR~0 site."""
from __future__ import annotations
import csv, re
from collections import defaultdict
from pathlib import Path

SRC = r"C:\Users\mwoo7\Downloads\google_us_calc-calculator-char_matching-terms_2026-06-06_15-29-07.csv"
OUT = Path(r"C:\Users\mwoo7\Downloads\claude files\out\construction_buildlist.csv")

# --- winnability: kill leaked SERP features + brand/device + bad intent ---
HARD_EXCLUDE = {"ai overview", "sitelinks", "top stories", "shopping", "shopping ads",
                "knowledge card", "knowledge panel"}
VIDEO_STRONG = {"image pack", "videos"}
FORUMS = "discussions"; FEAT_SNIPPET = "featured snippet"
BRAND = [r"\bdesmos\b", r"\bcasio\b", r"texas instruments", r"\bti[- ]?8[0-9]\b",
         r"\bti[- ]?nspire\b", r"\bfx[- ]?\d{2,3}\b", r"\bhp 12c\b", r"\bsharp el\b"]
DEVICE = ["scientific calculator", "graphing calculator", "printing calculator"]
BRAND_RE = re.compile("|".join(BRAND), re.I)
COMPUTATIONAL = re.compile(r"how many|how much|\bper\b|convert|cost of|price of", re.I)
SINGLE = re.compile(r"\bto\b|how many .* in|convert", re.I)

# --- NEGATIVE denylist: non-construction phrases where an entity word appears incidentally
#     (the wider compute-seed dragged these in via stone/block/rock/grading/chart). Precise so
#     legit pages survive: keep "concrete block","landscape rock","pipe schedule chart"; kill these.
NEG = re.compile(r"""
  \bgrading\s+(calculator|chart|scale|curve|app|system|software|sheet)|online\s+grading
  |(diamond|coin|embryo|card|psa|meat|beef|gem|stamp)\s+grading|grading\s+on\s+a\s+curve
  | kid\s+rock | the\s+rock | dwayne | halftime | grammy | amphitheat | seating\s+chart
  | billboard | rock\s+(chart|lose|band|concert|halftime|hall) | red\s+rock
  | rosetta | duolingo
  | h&r | \bhr\s+block | \btax\b | order\s+block | \btrading\b | stock\s+market | crypto | bitcoin
  | zodiac | astrology | tarot | horoscope | poker | guitar
""", re.I | re.X)

# --- 9 sub-hubs (ordered; first strong match wins; tie-break = hit count) ---
HUBS = [
  ("Concrete & Masonry", r"\bconcrete|cement|rebar|mortar\b|masonry|stucco|cinder|\bblock\b|\bbrick|\bpaver|\bslab|footing|retaining wall|\bgrout"),
  ("Aggregates & Landscaping", r"\bmulch|gravel|topsoil|\bsoil|\bsand\b|\bdirt|\bstone|\brock\b|aggregate|\bsod\b|compost|landscap|crushed|\bbase\b"),
  ("Lumber & Framing", r"\blumber|board foot|board feet|plywood|\bstud|\bjoist|rafter|\bbeam|\btruss|framing|2x4|2 x 4|linear feet|linear foot"),
  ("Drywall / Paint / Insulation", r"drywall|sheetrock|\bpaint|primer|insulation|wallpaper|joint compound|\br[- ]?value"),
  ("Flooring & Tile", r"\btile|floor|laminate|hardwood|carpet|vinyl|subfloor|underlayment|backsplash|\bgrout"),
  ("Roofing", r"\broof|shingle|gutter|fascia|soffit|\bpitch\b|\bslope\b"),
  ("Decking / Fencing / Stairs", r"\bdeck|\bfence|fencing|\bstair|railing|pergola|\bgate\b|baluster|spindle|picket|\bpost\b"),
  ("Earthwork & Sitework", r"asphalt|driveway|excavat|grading|\bgrade\b|paving|\btrench|french drain|\bfill\b|cubic yard|\bdig"),
  ("Electrical & Plumbing", r"conduit|\bwire|voltage|\bamp|breaker|\bpipe|\bpvc|\bpex|\bduct|\bhvac|\bbtu|\bcfm|electric|plumb|\bflow\b|\bgpm"),
]
HUB_RE = [(n, re.compile(p, re.I)) for n, p in HUBS]

def num(x):
    x=(x or "").replace(",","").strip()
    try: return float(x)
    except: return 0.0

def feats(s): return {t.strip().lower() for t in (s or "").split(",") if t.strip()}

def tier(kw,intents,fs):
    low=kw.lower(); il=(intents or "").lower()
    if NEG.search(low): return "RED","contaminant"
    if BRAND_RE.search(low): return "RED","brand"
    if any(d in low for d in DEVICE): return "RED","device"
    if re.search(r"(?<!non-)\bbranded\b",il) and "non-branded" not in il: return "RED","branded"
    if re.search(r"(?<!non-)\bnavigational\b",il): return "RED","nav"
    if re.search(r"(?<!non-)\blocal\b",il) and "non-local" not in il: return "RED","local"
    leaked=HARD_EXCLUDE & fs
    if leaked: return "RED","leak:"+sorted(leaked)[0]
    if FEAT_SNIPPET in fs and SINGLE.search(low): return "AMBER","fs-single"
    if VIDEO_STRONG & fs: return "AMBER","video"
    return "GREEN","clean"

def assign_hub(kw):
    low=kw.lower(); best=None; bestn=0
    for name,rx in HUB_RE:
        n=len(rx.findall(low))
        if n>bestn: best,bestn=name,n
    return best or "General / Area"

rows=[]
with open(SRC,encoding="utf-16") as f:
    for r in csv.DictReader(f,delimiter="\t"):
        kw=(r.get("Keyword") or "").strip()
        if not kw: continue
        fs=feats(r.get("SERP Features"))
        t,reason=tier(kw,r.get("Intents",""),fs)
        rows.append({"kw":kw,"parent":(r.get("Parent Keyword") or kw).strip(),
            "vol":int(num(r.get("Volume"))),"kd":int(num(r.get("Difficulty"))),
            "cpc":num(r.get("CPC")),"tp":num(r.get("Traffic potential")),
            "tier":t,"reason":reason,"hub":assign_hub(kw),
            "features":",".join(sorted(fs))})

# pages = parent keyword; hub = majority hub of members; demand = summed winnable vol
pages=defaultdict(list)
for r in rows: pages[r["parent"]].append(r)

page_rows=[]
for parent,mem in pages.items():
    mem.sort(key=lambda m:-m["vol"])
    green=[m for m in mem if m["tier"]!="RED"]
    if not green: continue
    head=green[0]
    hub_votes=defaultdict(int)
    for m in mem: hub_votes[m["hub"]]+=m["vol"]
    hub=max(hub_votes,key=hub_votes.get)
    page_rows.append({"hub":hub,"tier":head["tier"],"parent":parent,
        "demand":sum(m["vol"] for m in green),"head_kw":head["kw"],
        "head_vol":head["vol"],"head_kd":head["kd"],"min_kd":min(m["kd"] for m in green),
        "n_kw":len(green),"cpc":round(max(m["cpc"] for m in mem),2),
        "sample":" | ".join(f"{m['kw']}(v{m['vol']},kd{m['kd']})" for m in green[:4])})

page_rows.sort(key=lambda p:-p["demand"])
byhub=defaultdict(list)
for p in page_rows: byhub[p["hub"]].append(p)

OUT.parent.mkdir(parents=True,exist_ok=True)
with open(OUT,"w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f,fieldnames=["hub","rank_in_hub","tier","parent","demand","head_kw","head_vol","head_kd","min_kd","n_kw","cpc","sample"])
    w.writeheader()
    hub_order=[n for n,_ in HUBS]+["General / Area"]
    for hub in hub_order:
        for i,p in enumerate(sorted(byhub.get(hub,[]),key=lambda x:-x["demand"]),1):
            w.writerow({"hub":hub,"rank_in_hub":i,**{k:p.get(k) for k in ["tier","parent","demand","head_kw","head_vol","head_kd","min_kd","n_kw","cpc","sample"]}})

# --- report ---
tc=defaultdict(int)
for r in rows: tc[r["tier"]]+=1
print(f"loaded {len(rows)} construction keywords")
print(f"keyword tiers: {dict(tc)}")
print(f"build PAGES (parent topics w/ >=1 non-RED kw): {len(page_rows)}")
print(f"\n{'='*70}\nPAGES + DEMAND BY SUB-HUB\n{'='*70}")
hub_order=[n for n,_ in HUBS]+["General / Area"]
for hub in hub_order:
    ps=sorted(byhub.get(hub,[]),key=lambda x:-x["demand"])
    if not ps: continue
    tot=sum(p["demand"] for p in ps)
    print(f"\n### {hub}  -- {len(ps)} pages, {tot:,} total demand")
    for p in ps[:12]:
        print(f"   dem{p['demand']:>6} kd{p['head_kd']:>2}(min{p['min_kd']:>2}) n{p['n_kw']:>2} ${p['cpc']:>5}  {p['head_kw']}")
    if len(ps)>12: print(f"   ...+{len(ps)-12} more pages")
print(f"\nfull blueprint -> {OUT}")
