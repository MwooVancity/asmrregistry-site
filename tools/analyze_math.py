#!/usr/bin/env python3
"""Classify the math.csv Ahrefs net into a per-sub-hub build blueprint for a DR~0 site.

Math differs from construction in two ways that change the method:
  1. Math vocabulary collides with everyday English ("factor meals", "amazon prime",
     "two-factor auth", "range rover", "what does X mean"). The construction net used an
     entity Include filter; this export did not, so we POSITIVE-GATE: a row survives only if
     it matches a real math-hub anchor. No hub match => off-topic => dropped.
  2. The money heads are owned by computational giants (Symbolab, Mathway, Desmos, Wolfram,
     Photomath, Calculator.net, GeoGebra) and most "how to find X" heads carry an AI Overview.
     So we additionally tally AIO incidence per hub -- the honest winnability signal that KD
     hides. KD/SERP-feature here is a PRE-FILTER, never the verdict (live SERP sweep gates GREEN).
"""
from __future__ import annotations
import csv, re
from collections import defaultdict
from pathlib import Path

SRC = r"C:\Users\mwoo7\Downloads\math.csv"
OUT = Path(r"C:\Users\mwoo7\Downloads\claude files\out\math_buildlist.csv")

# --- winnability: leaked SERP features + brand/device + bad intent (same spine as construction) ---
HARD_EXCLUDE = {"sitelinks", "top stories", "shopping", "shopping ads",
                "knowledge card", "knowledge panel"}
AIO = "ai overview"
VIDEO_STRONG = {"image pack", "videos"}
FORUMS = "discussions"; FEAT_SNIPPET = "featured snippet"

# math-calculator brands own these heads outright (navigational/branded device intent)
BRAND = [r"\bdesmos\b", r"\bsymbolab\b", r"\bmathway\b", r"\bwolfram\b", r"alpha\b",
         r"photomath", r"geogebra", r"cymath", r"quickmath", r"emathhelp", r"mathpapa",
         r"calculator\.net", r"omni\s?calculator", r"microsoft math", r"\bti[- ]?8[0-9]\b",
         r"\bti[- ]?nspire\b", r"\bcasio\b", r"\bfx[- ]?\d{2,3}\b", r"\bdesmos"]
DEVICE = ["scientific calculator", "graphing calculator", "printing calculator",
          "best calculator", "calculator app", "calculator online free download"]
BRAND_RE = re.compile("|".join(BRAND), re.I)
SINGLE = re.compile(r"\bto\b|how many .* in|\bconvert\b", re.I)

# --- NEG denylist: non-math phrases where a math word appears incidentally.
#     Calibrated against the live export (factor=11,375 rows, mostly garbage). Precise so legit
#     math survives: keep "prime factorization","scale factor","domain and range"; kill these. ---
NEG = re.compile(r"""
    factor\s*(meals?|75|food|_|com|\b\s*menu|\s*bargain|\s*plan)   # Factor (meal kit)
  | relief\s+factor | \bx[- ]?factor\b | fear\s+factor | gx\s+factor | chill\s+factor
  | (two|2)[- ]?factor | two[- ]?step | impact\s+factor | abiotic | \bbiotic
  | (growth|transcription|sigma|clotting|intrinsic|rh|von\s+willebrand|tissue|necrosis|
     g\b|nuclear|complement|releasing|stimulating|risk|protective|environmental|limiting|
     confounding|push|wow|fudge|max\b|form\b)\s+factor
  | factor\s+(v|5)\s+leiden | wind\s+chill | snow\s+factor | factor\s+(of\s+safety|investing)
  | amazon\s+prime | prime\s+(video|membership|rib|day|peptide|drink|hydration|now|gaming|music|reading)
  | optimus\s+prime | prime\s+(cost|student) | how\s+much\s+is\s+prime
  | range\s+rover | gas\s+range | kitchen\s+range | shooting\s+range | driving\s+range | free\s+range
  | root\s+(beer|canal|word|cause|vegetable|chakra|note) | tap\s?root | grass\s?roots | rooting
  | power\s+(ranger|outage|bi\b|automate|wash|nap|ball|plant|steering|of\s+attorney)
  | (a\s+la\s+)?mode\s+(of\s+transport|deuses)? | airplane\s+mode | dark\s+mode | sleep\s+mode
  | college\s+degree | degree\s+(deodorant|symbol|of\s+a\s+burn) | \d+\s+degree\s+(burn|angle\s+haircut)?
  | area\s+(code|rug|51|man|of\s+rug) | bay\s+area | greater\s+\w+\s+area
  | (blood|hair|trading|tidal|stroke|lung|liquid|residual)\s+volume | volume\s+(booster|of\s+hair|control|pills)
  | (guitar|piano|ukulele|vocal)\s+chord | spinal\s+chord
  | (tv|netflix|world|movie|book|fibonacci\s+tv)\s+series
  | credit\s+limit | limit\s+(break|order) | off\s+limits
  | (kidney|liver|body|executive|lung|thyroid|cognitive)\s+function | function\s+(hall|room|of\s+the)
  | (facial|gene|genetic)\s+expression
  | terms\s+(of\s+service|and\s+conditions|of\s+endearment) | payment\s+terms
  | periodic\s+table | table\s+(saw|salt|tennis|runner|setting|rock) | water\s+table | dining\s+table
  | net\s+(worth|income|carbs|profit|salary|force\s+of\s+habit)? | \.net\b | fishing\s+net | tennis\s+net
  | what\s+does\s+\w+\s+mean | \bmeaning\b | per\s+diem | per\s+capita
  | median\s+(income|household|age|nerve|salary|home|xl) | mean\s+arterial
  | sequence\s+(of\s+events|dance|movie|film) | dna\s+sequenc | genome
  | matrix\s+(movie|reloaded|resurrections) | the\s+matrix
  | vector\s+(art|logo|graphics|file|image|borne|marvel)
  | (military|gpa|grade|test|exam|class|college|school|letter|salary|pay|covid|risk|score)\s+(scale|calculator)
  | how\s+much\s+(is|does|are)\s+(amazon|netflix|hulu|disney|spotify|costco)
  | calorie | bmi\b | pregnancy | ovulation | due\s+date | gpa\b | grade\s+calculator | final\s+grade
  | mortgage | loan\s+calculator | car\s+payment | tip\s+calculator | sales\s+tax | paycheck
  | meal | recipe | diet | weight\s+loss
  | body\s+fat | debt[- ]?to[- ]?income | triglyceride | destiny\s+matrix | numerolog | astrolog
  | love\s+calculator | \bage\s+calculator | \bdate\s+calculator | \btime\s+calculator | dunk\s+calculator
  | (caffeine|message|image\s+generation|download|upload|withdrawal|deposit|data|api|token|prompt)\s+limit
  | limit\s+per\s+(day|month|week) | per\s+day\b
  | arc\s+raiders | \bjjk\b | \banime\b | \bmanga\b | pokemon | minecraft | roblox | genshin | \bnba\b | \bnfl\b
  | chatgpt | \bgpt\b | \bnit\s+(score|calculator)\b
""", re.I | re.X)

# --- math sub-hubs (ordered; first strongest match wins; tie-break = hit count).
#     Anchors require genuine math context so contaminants that slip NEG still fail to assign. ---
HUBS = [
  ("Arithmetic & Fractions",
   r"\bfraction|mixed number|\bpercent|percentage|\bratio\b|\bgcf\b|\blcm\b|greatest common|least common|"
   r"long division|order of operations|\bpemdas\b|rounding|\bdecimal|reciprocal|\bproportion|cross multipl|"
   r"simplify(ing)? fraction|improper fraction|\bremainder\b|times table|multiplication"),
  ("Algebra",
   r"\balgebra|\bequation|quadratic|polynomial|\bfactoring|how to factor|\bfactor (calculator|out|the|each|by|trinomial|polynomial|quadratic|completely|the expression)|"
   r"prime factor|\bexponent|logarithm|\blog base|\bslope\b|\bsystem of|inequalit|\bfoil\b|distribut|"
   r"\bsimplify|expand|literal equation|absolute value|completing the square|synthetic division|rational expression|"
   r"point slope|slope intercept|standard form|\bdomain and range|function (notation|composition)|composite function|inverse function"),
  ("Geometry",
   r"\btriangle|\bcircle\b|circumference|\barea\b|perimeter|\bvolume\b|surface area|pythag|\bangle|polygon|"
   r"rectangle|\bsquare\b|trapezoid|parallelogram|rhombus|\bsphere|cylinder|\bcone\b|\bprism|hypotenuse|"
   r"midpoint|distance formula|\bradius\b|diameter|\bchord\b|\bsector\b|\barc length|interior angle|"
   r"\bvertex|vertices|congruen|similar triangle|special right|30 60 90|45 45 90|herons|\bpi\b"),
  ("Trigonometry",
   r"\btrig|\bsine\b|\bcosine\b|\btangent\b|\bsin\b|\bcos\b|\btan\b|\bsec\b|\bcsc\b|\bcot\b|"
   r"unit circle|\bradian|law of (sines|cosines)|arc(sin|cos|tan)|inverse (sine|cosine|tangent)|"
   r"\bamplitude|\bperiod of|reference angle|degrees to radians|radians to degrees"),
  ("Calculus",
   r"\bderivative|\bintegral|antiderivative|\blimit\b|\bdifferentia|\bchain rule|product rule|quotient rule|"
   r"\briemann|taylor series|maclaurin|partial derivative|implicit different|related rates|\bconverg|"
   r"\bdivergen|second derivative|definite integral|indefinite integral|\bintegration\b|\bcalculus"),
  ("Statistics & Probability",
   r"standard deviation|\bvariance\b|\bmean\b|\bmedian\b|\bmode\b|\bz[- ]?score|\bt[- ]?score|"
   r"confidence interval|\bregression|correlation|\bprobabilit|permutation|combination|\bfactorial|"
   r"binomial|\bp[- ]?value|chi[- ]?square|normal distribution|\bquartile|interquartile|\bpercentile|"
   r"how to find (the )?(mean|median|mode|range|variance)|expected value|margin of error|sample size|"
   r"\bnpr\b|\bncr\b|five number|box plot|frequency|coefficient of variation|mean absolute deviation"),
  ("Number Theory & Bases",
   r"prime number|prime factoriz|\bfactorial|roman numeral|binary (to|number|calculator|conversion)|"
   r"hexadecimal|\boctal\b|scientific notation|number base|\bmodulo\b|\bmod calculator|\bgcd\b|"
   r"divisib|perfect number|figurate|\bbase \d|truth table|\bfibonacci\b"),
  ("Matrices & Linear Algebra",
   r"\bmatri(x|ces)|determinant|eigen(value|vector)|\bvector\b|dot product|cross product|"
   r"row echelon|\brref\b|gaussian elim|\btranspose|\binverse matrix|linear (algebra|combination|transformation)|"
   r"\bspan\b|orthogonal|magnitude of"),
]
HUB_RE = [(n, re.compile(p, re.I)) for n, p in HUBS]

def num(x):
    x=(x or "").replace(",","").strip()
    try: return float(x)
    except: return 0.0

def feats(s): return {t.strip().lower() for t in (s or "").split(",") if t.strip()}

def assign_hub(kw):
    low=kw.lower(); best=None; bestn=0
    for name,rx in HUB_RE:
        n=len(rx.findall(low))
        if n>bestn: best,bestn=name,n
    return best  # None => off-topic

def tier(kw,intents,fs,hub):
    low=kw.lower(); il=(intents or "").lower()
    if hub is None: return "OFF","off-topic"
    if NEG.search(low): return "RED","contaminant"
    if BRAND_RE.search(low): return "RED","brand"
    if any(d in low for d in DEVICE): return "RED","device"
    if re.search(r"(?<!non-)\bbranded\b",il) and "non-branded" not in il: return "RED","branded"
    if re.search(r"(?<!non-)\bnavigational\b",il): return "RED","nav"
    leaked=HARD_EXCLUDE & fs
    if leaked: return "RED","leak:"+sorted(leaked)[0]
    if AIO in fs: return "AMBER","aio"          # AI Overview => CTR-suppressed, not auto-dead but gated
    if FEAT_SNIPPET in fs and SINGLE.search(low): return "AMBER","fs-single"
    if VIDEO_STRONG & fs: return "AMBER","video"
    return "GREEN","clean"

rows=[]
with open(SRC,encoding="utf-16") as f:
    for r in csv.DictReader(f,delimiter="\t"):
        kw=(r.get("Keyword") or "").strip()
        if not kw: continue
        fs=feats(r.get("SERP Features"))
        hub=assign_hub(kw)
        t,reason=tier(kw,r.get("Intents",""),fs,hub)
        rows.append({"kw":kw,"parent":(r.get("Parent Keyword") or kw).strip(),
            "vol":int(num(r.get("Volume"))),"kd":int(num(r.get("Difficulty"))),
            "cpc":num(r.get("CPC")),"tp":num(r.get("Traffic potential")),
            "tier":t,"reason":reason,"hub":hub or "(off-topic)","aio":AIO in fs,
            "features":",".join(sorted(fs))})

# pages = parent keyword; hub = volume-majority hub of members; demand = summed winnable (GREEN+AMBER) vol
pages=defaultdict(list)
for r in rows:
    if r["tier"]=="OFF": continue          # off-topic never seeds or joins a page
    pages[r["parent"]].append(r)

page_rows=[]
for parent,mem in pages.items():
    mem.sort(key=lambda m:-m["vol"])
    win=[m for m in mem if m["tier"] in ("GREEN","AMBER")]
    if not win: continue
    head=win[0]
    hub_votes=defaultdict(int)
    for m in mem: hub_votes[m["hub"]]+=m["vol"]
    hub=max(hub_votes,key=hub_votes.get)
    page_rows.append({"hub":hub,"tier":head["tier"],"parent":parent,
        "demand":sum(m["vol"] for m in win),"head_kw":head["kw"],
        "head_vol":head["vol"],"head_kd":head["kd"],"min_kd":min(m["kd"] for m in win),
        "head_aio":head["aio"],"n_kw":len(win),"cpc":round(max(m["cpc"] for m in mem),2),
        "sample":" | ".join(f"{m['kw']}(v{m['vol']},kd{m['kd']}{',AIO' if m['aio'] else ''})" for m in win[:4])})

page_rows.sort(key=lambda p:-p["demand"])
byhub=defaultdict(list)
for p in page_rows: byhub[p["hub"]].append(p)

OUT.parent.mkdir(parents=True,exist_ok=True)
with open(OUT,"w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f,fieldnames=["hub","rank_in_hub","tier","parent","demand","head_kw","head_vol","head_kd","min_kd","head_aio","n_kw","cpc","sample"])
    w.writeheader()
    hub_order=[n for n,_ in HUBS]
    for hub in hub_order:
        for i,p in enumerate(sorted(byhub.get(hub,[]),key=lambda x:-x["demand"]),1):
            w.writerow({"hub":hub,"rank_in_hub":i,**{k:p.get(k) for k in ["tier","parent","demand","head_kw","head_vol","head_kd","min_kd","head_aio","n_kw","cpc","sample"]}})

# --- report ---
tc=defaultdict(int)
for r in rows: tc[r["tier"]]+=1
aio_pages=sum(1 for p in page_rows if p["head_aio"])
green_pages=[p for p in page_rows if p["tier"]=="GREEN"]
print(f"loaded {len(rows)} keywords")
print(f"keyword tiers: {dict(tc)}  (OFF = off-topic, dropped)")
print(f"on-topic keywords: {len(rows)-tc['OFF']}  | build PAGES (parent w/ >=1 GREEN/AMBER): {len(page_rows)}")
print(f"GREEN-head pages (no AIO, no brand/leak): {len(green_pages)}  |  page heads carrying AI Overview: {aio_pages} ({100*aio_pages//max(1,len(page_rows))}%)")
print(f"\n{'='*74}\nPAGES + DEMAND BY SUB-HUB  (demand = summed GREEN+AMBER volume)\n{'='*74}")
for hub,_ in HUBS:
    ps=sorted(byhub.get(hub,[]),key=lambda x:-x["demand"])
    if not ps: continue
    tot=sum(p["demand"] for p in ps); g=sum(1 for p in ps if p["tier"]=="GREEN")
    print(f"\n### {hub}  -- {len(ps)} pages ({g} GREEN-head), {tot:,} demand")
    for p in ps[:12]:
        flag="GREEN" if p["tier"]=="GREEN" else ("AMB/AIO" if p["head_aio"] else "AMB")
        print(f"   {flag:>7} dem{p['demand']:>6} kd{p['head_kd']:>2}(min{p['min_kd']:>2}) n{p['n_kw']:>2}  {p['head_kw']}")
    if len(ps)>12: print(f"   ...+{len(ps)-12} more")
print(f"\nfull blueprint -> {OUT}")
