#!/usr/bin/env python3
"""Classify the conversion.csv Ahrefs net into a per-sub-hub build blueprint for a DR~0 unit-conversion calculator site.
Mirrors tools/analyze_construction.py: parent=page, 9+ sub-hubs, winnability tiering, contaminant denylist."""
from __future__ import annotations
import csv, re
from collections import defaultdict
from pathlib import Path

SRC = r"C:\Users\mwoo7\Downloads\conversion.csv"
OUT = Path(r"C:\Users\mwoo7\Downloads\claude files\out\conversion_buildlist.csv")

# --- winnability: kill leaked SERP features + brand/device + bad intent ---
# Knowledge card is the unit-converter widget Google shows inline => zero-click; treat as hard kill.
HARD_EXCLUDE = {"ai overview", "sitelinks", "top stories", "shopping", "shopping ads",
                "knowledge card", "knowledge panel"}
VIDEO_STRONG = {"image pack", "videos"}
FORUMS = "discussions"; FEAT_SNIPPET = "featured snippet"
BRAND = [r"\bgoogle\b", r"\bsiri\b", r"\balexa\b", r"\bunit converter\b"]
DEVICE = ["scientific calculator", "graphing calculator"]
BRAND_RE = re.compile("|".join(BRAND), re.I)
COMPUTATIONAL = re.compile(r"how many|how much|\bto\b|convert|in (a|an)\b", re.I)
SINGLE = re.compile(r"\bto\b|how many .* in|convert", re.I)

# --- NEGATIVE denylist: non-conversion phrases dragged in via "how many/how much/oz/ml/mg" etc.
#     The net is heavily contaminated by health/medical/drug/diet content + junk strings.
NEG = re.compile(r"""
    say\s+goodbye | get\s+rid\s+of | how\s+to\s+(relieve|stop|cure|treat|lose|get)
  | sciatic | sinus | cold\s+sore | nerve\s+pain | \bpain\b | headache | migraine | cramp
  | \bdrink\b | water\s+(a|per)\s+day | how\s+much\s+water | \bdiet\b | weight\s+loss | lose\s+weight
  | calorie(s)?\s+(to\s+lose|deficit|burn|a\s+day|per\s+day)
  | \bdosage | \bdose\b | mg\s+of\s+(ibuprofen|tylenol|melatonin|caffeine|benadryl|adderall|edible|thc|cbd|weed|cocaine|xanax|gabapentin)
  | ibuprofen | tylenol | acetaminophen | melatonin | benadryl | adderall | gabapentin | xanax | metformin | amoxicillin
  | \bthc\b | \bcbd\b | \bweed\b | edible | cocaine | mushroom | \bketamine | \bmdma | psilocybin | \bnicotine
  | retrieving\s+data | wait\s+a\s+few\s+seconds
  | \bbac\b | blood\s+alcohol | how\s+many\s+(beers|shots|drinks)\s+to\s+get
  | \bzodiac | astrology | horoscope | \btarot
  | pregnan | \bbaby\b | weeks\s+pregnant | how\s+many\s+weeks
  | \bhr\s+block | \btax\b | salary | \bs\&p | stock\s+market | \bcrypto | bitcoin
  | \bsex\b | \bporn | \bnsfw
""", re.I | re.X)

# --- conversion sub-hubs (ordered; most hits wins; tie-break = order) ---
HUBS = [
  ("Volume & Liquid", r"\boz\b|ounce|\bquart|\bgallon|\bliter|litre|\bml\b|millilit|\bcup|\bpint|\btbsp|tablespoon|\btsp|teaspoon|fluid|fl oz|\bdram\b|\bgill\b|cubic (inch|foot|feet|cm|meter)"),
  ("Weight & Mass", r"\blb\b|\blbs\b|pound|\bkg\b|kilogram|\bgram|\bgrams\b|\bg\b|\bmg\b|milligram|\bstone\b|\bton\b|tonne|ounce(s)? to (pound|gram|kg)|carat"),
  ("Length & Distance", r"\bmm\b|millimet|\bcm\b|centimet|\binch|\bft\b|\bfoot\b|\bfeet\b|\byard|\bmile|\bmeter|\bmetre|\bkm\b|kilomet|nautical|furlong|\bhand\b|how tall"),
  ("Area", r"square (feet|foot|inch|meter|yard|mile|km)|\bsq ft|\bacre|hectare|\barea\b"),
  ("Temperature", r"fahrenheit|celsius|\bkelvin|\b\d+ ?(f|c) (to|in)|degrees|\btemp\b"),
  ("Time", r"\bhour|\bminute|\bsecond|\bday(s)?\b|\bweek|\bmonth|\byear|\bdecade|fortnight|how many (hours|days|minutes|weeks|seconds)"),
  ("Speed & Pace", r"\bmph\b|\bkmh\b|km/h|knot|\bpace\b|steps to (miles|km)|\bsteps\b|minutes per mile|speed"),
  ("Cooking & Recipe", r"stick(s)? of butter|grams to cups|cups to (grams|ml|oz)|recipe|\bbutter\b|\bflour\b|\bsugar\b|\brice\b|\bcoffee\b scoop"),
  ("Digital & Data", r"\bkb\b|\bmb\b|\bgb\b|\btb\b|megabyte|gigabyte|kilobyte|terabyte|\bbyte|\bbit(s)?\b|mbps|\bghz\b|\bmhz\b"),
  ("Energy / Power / Pressure", r"\bwatt|\bkw\b|kilowatt|\bhp\b|horsepower|\bpsi\b|\bbar\b|pascal|\bjoule|\bbtu\b|\bcalorie|\bkcal|\bamp\b|\bvolt|\bohm\b|newton|\bforce\b"),
  ("Angle / Number / Misc", r"degree|radian|\bpercent|\bratio\b|fraction|scientific notation|roman numeral|\bbase\b \d"),
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
    if re.search(r"transactional|commercial",il): return "RED","commercial"
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
    return best or "General / Other"

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
            "fs":fs,"features":",".join(sorted(fs))})

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
    # is the head walled by AIO or knowledge card across its winnable members? (audit signal)
    walled=any(("ai overview" in m["fs"] or "knowledge card" in m["fs"]) for m in green)
    page_rows.append({"hub":hub,"tier":head["tier"],"parent":parent,
        "demand":sum(m["vol"] for m in green),"head_kw":head["kw"],
        "head_vol":head["vol"],"head_kd":head["kd"],"min_kd":min(m["kd"] for m in green),
        "n_kw":len(green),"cpc":round(max(m["cpc"] for m in mem),2),"walled":walled,
        "sample":" | ".join(f"{m['kw']}(v{m['vol']},kd{m['kd']})" for m in green[:4])})

page_rows.sort(key=lambda p:-p["demand"])
byhub=defaultdict(list)
for p in page_rows: byhub[p["hub"]].append(p)

OUT.parent.mkdir(parents=True,exist_ok=True)
with open(OUT,"w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f,fieldnames=["hub","rank_in_hub","tier","walled","parent","demand","head_kw","head_vol","head_kd","min_kd","n_kw","cpc","sample"])
    w.writeheader()
    hub_order=[n for n,_ in HUBS]+["General / Other"]
    for hub in hub_order:
        for i,p in enumerate(sorted(byhub.get(hub,[]),key=lambda x:-x["demand"]),1):
            w.writerow({"hub":hub,"rank_in_hub":i,**{k:p.get(k) for k in ["tier","walled","parent","demand","head_kw","head_vol","head_kd","min_kd","n_kw","cpc","sample"]}})

# --- report ---
tc=defaultdict(int); rc=defaultdict(int)
for r in rows:
    tc[r["tier"]]+=1
    if r["tier"]=="RED": rc[r["reason"]]+=1
print(f"loaded {len(rows)} conversion keywords")
print(f"keyword tiers: {dict(tc)}")
print(f"RED reasons: {dict(sorted(rc.items(),key=lambda x:-x[1]))}")
print(f"build PAGES (parent topics w/ >=1 non-RED kw): {len(page_rows)}")
big=[p for p in page_rows if p["demand"]>=500]
walled=[p for p in big if p["walled"]]
print(f"PAGES with demand>=500: {len(big)}   of those AIO/KnowledgeCard-walled: {len(walled)} ({100*len(walled)//max(1,len(big))}%)")
print(f"\n{'='*74}\nPAGES + DEMAND BY SUB-HUB (demand>=500 shown)\n{'='*74}")
hub_order=[n for n,_ in HUBS]+["General / Other"]
for hub in hub_order:
    ps=[p for p in sorted(byhub.get(hub,[]),key=lambda x:-x["demand"]) if p["demand"]>=500]
    if not ps: continue
    tot=sum(p["demand"] for p in ps)
    wl=sum(1 for p in ps if p["walled"])
    print(f"\n### {hub}  -- {len(ps)} pages>=500dem ({wl} walled), {tot:,} total demand")
    for p in ps[:10]:
        flag="WALL" if p["walled"] else "open"
        print(f"   [{flag}] dem{p['demand']:>6} kd{p['head_kd']:>2}(min{p['min_kd']:>2}) n{p['n_kw']:>2} ${p['cpc']:>5}  {p['head_kw']}")
    if len(ps)>10: print(f"   ...+{len(ps)-10} more pages>=500")
print(f"\nfull blueprint -> {OUT}")
