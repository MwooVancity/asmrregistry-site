#!/usr/bin/env python3
"""
analyze_ahrefs.py -- classify Ahrefs calculator-keyword exports into a DR~0 build list.

Reframe (post-filter data): winnability was already (supposed to be) handled at the Ahrefs
filter, so the output is a PRIORITY build list, not a winnability gate. A CLUSTER (Ahrefs
Parent Keyword) = ONE page; member keywords = that page's targets.

Tiers:
  RED  (drop)  = brand/device token, Intent Navigational/Branded/Local, OR a hard-exclude
                 SERP feature that LEAKED past the Ahrefs filter (AI Overview, Sitelinks,
                 Top stories, Shopping, Knowledge card/panel).
  SKIP         = passes everything but parent-topic Traffic Potential < floor (too thin).
  GREEN(build) = naked SERP (none / PAA / ads only) with real TP, OR Discussions present on
                 a computational-pattern query (the gap signal).
  AMBER(care)  = Image pack / Videos carousel, OR Featured snippet on a single-answer query,
                 OR Discussions on an advisory-pattern query.

Rank: GREEN before AMBER; within tier by page TP, then CPC (monetization).
"""
from __future__ import annotations
import csv, re, sys
from collections import defaultdict
from pathlib import Path

TP_FLOOR = 500
FILES = [("A", r"C:\Users\mwoo7\Downloads\group a.csv"),
         ("B", r"C:\Users\mwoo7\Downloads\group b.csv")]
OUT = Path(r"C:\Users\mwoo7\Downloads\claude files\out\ahrefs_buildlist.csv")

# --- exact Ahrefs SERP-feature tokens (from the live vocab read) ---
HARD_EXCLUDE = {"ai overview", "sitelinks", "top stories", "shopping", "shopping ads",
                "knowledge card", "knowledge panel"}   # Paid sitelinks is KEPT (distinct token)
VIDEO_STRONG = {"image pack", "videos"}                # carousel/visual intent -> AMBER
FORUMS = "discussions"
FEAT_SNIPPET = "featured snippet"

# --- brand / hardware denylist (word-boundary / phrase; landmines removed: no bare hp/sharp) ---
BRAND = [r"\bdesmos\b", r"\bcasio\b", r"texas instruments", r"\bti[- ]?8[0-9]\b",
         r"\bti[- ]?nspire\b", r"\bfx[- ]?\d{2,3}\b", r"\bhp 12c\b", r"\bhp 10bii\b",
         r"\bsharp el\b", r"\bcanon\b calculator", r"\bvictor\b calculator"]
DEVICE = ["scientific calculator", "graphing calculator", "printing calculator",
          "basic calculator", "pocket calculator", "desk calculator", "calculator watch"]
BRAND_RE = re.compile("|".join(BRAND), re.I)

COMPUTATIONAL = re.compile(r"how many|how much|\bper\b|convert|\bto\b|cost of|price of|\bin\b", re.I)
ADVISORY = re.compile(r"should i|worth it|\bbest\b|\bvs\b|versus|which", re.I)
SINGLE_ANSWER = re.compile(r"\bto\b|how many .* in|convert", re.I)  # conversion / fixed-number


def num(x):
    x = (x or "").replace(",", "").strip()
    try:
        return float(x)
    except ValueError:
        return 0.0


def feats(s):
    return {t.strip().lower() for t in (s or "").split(",") if t.strip()}


def classify(kw, intents, fset):
    low = kw.lower()
    # --- RED ---
    if BRAND_RE.search(low):
        return "RED", "brand"
    if any(d in low for d in DEVICE):
        return "RED", "hardware-device"
    il = intents.lower()
    if "navigational" in il or "branded" in il or ",local" in il or "local," in il or il.endswith("local"):
        # Ahrefs flags: Branded / Local appear as comma fields; 'Non-branded'/'Non-local' are negatives
        if "branded" in il and "non-branded" not in il:
            return "RED", "intent-branded"
        if re.search(r"(^|,)local", il) and "non-local" not in il.replace("non-local", ""):
            pass  # handled below
    if re.search(r"(?<!non-)\bbranded\b", il) and "non-branded" not in il:
        return "RED", "intent-branded"
    if re.search(r"(?<!non-)\bnavigational\b", il):
        return "RED", "intent-navigational"
    if re.search(r"(?<!non-)\blocal\b", il) and "non-local" not in il:
        return "RED", "intent-local"
    leaked = HARD_EXCLUDE & fset
    if leaked:
        return "RED", "leak:" + sorted(leaked)[0]
    # --- GREEN / AMBER ---
    forums = FORUMS in fset
    fs = FEAT_SNIPPET in fset
    video = bool(VIDEO_STRONG & fset)
    comp = bool(COMPUTATIONAL.search(low))
    adv = bool(ADVISORY.search(low))
    single = bool(SINGLE_ANSWER.search(low))
    if fs and single:
        return "AMBER", "fs-single-answer"
    if video:
        return "AMBER", "visual-intent"
    if forums and adv:
        return "AMBER", "forums-advisory"
    if forums and comp:
        return "GREEN", "forum-gap"
    if forums:
        return "GREEN", "forum-gap"
    return "GREEN", "clean"


# --- load both files ---
rows = []
intent_blank = defaultdict(int)
for grp, path in FILES:
    with open(path, encoding="utf-16") as fh:
        for r in csv.DictReader(fh, delimiter="\t"):
            kw = (r.get("Keyword") or "").strip()
            if not kw:
                continue
            intents = (r.get("Intents") or "").strip()
            if not intents:
                intent_blank[grp] += 1
            fset = feats(r.get("SERP Features"))
            tier, reason = classify(kw, intents, fset)
            rows.append({
                "grp": grp, "kw": kw, "parent": (r.get("Parent Keyword") or kw).strip(),
                "vol": int(num(r.get("Volume"))), "tp": num(r.get("Traffic potential")),
                "cpc": num(r.get("CPC")), "kd": int(num(r.get("Difficulty"))),
                "tier": tier, "reason": reason, "features": ",".join(sorted(fset)),
                "category": (r.get("Category") or "").strip(),
            })

# --- keyword-level tier counts ---
kw_tier = defaultdict(int); red_reason = defaultdict(int)
for r in rows:
    kw_tier[r["tier"]] += 1
    if r["tier"] == "RED":
        red_reason[r["reason"]] += 1

# =====================================================================
# CORRECTED RANKING: the export has NO Lowest-DR column, and Traffic Potential
# is a REVERSE signal (high TP = a dominant page owns the topic). The only
# incumbent-weakness number in the file is KD. So: gate winnability on KD<=KD_MAX
# (weak incumbent proxy) + Vol>=VOL_MIN, group winnable keywords into pages, and
# rank by REAL DEMAND (summed winnable volume), not incumbent TP.
# =====================================================================
KD_MAX = 20      # weak-incumbent proxy (stands in for the missing Lowest DR<=20)
VOL_MIN = 100

winnable = [r for r in rows if r["tier"] != "RED" and r["kd"] <= KD_MAX and r["vol"] >= VOL_MIN]
wpages = defaultdict(list)
for r in winnable:
    wpages[r["parent"]].append(r)

page_rows = []
for parent, members in wpages.items():
    members.sort(key=lambda m: -m["vol"])
    head = members[0]                      # highest-volume WINNABLE keyword (not the giant parent)
    demand = sum(m["vol"] for m in members)
    page_rows.append({
        "tier": head["tier"], "parent": parent, "demand": demand,
        "head_kw": head["kw"], "head_vol": head["vol"], "head_kd": head["kd"],
        "min_kd": min(m["kd"] for m in members), "top_cpc": round(max(m["cpc"] for m in members), 2),
        "n_kw": len(members), "groups": "".join(sorted({m["grp"] for m in members})),
        "category": head["category"], "features": head["features"],
        "sample": " | ".join(f"{m['kw']}(v{m['vol']},kd{m['kd']})" for m in members[:5]),
    })

order = {"GREEN": 0, "AMBER": 1}
build = [p for p in page_rows if p["demand"] >= VOL_MIN]
build.sort(key=lambda p: (order.get(p["tier"], 2), -p["demand"], -p["top_cpc"]))

OUT.parent.mkdir(parents=True, exist_ok=True)
cols = ["rank", "tier", "parent", "demand", "head_kw", "head_vol", "head_kd", "min_kd",
        "top_cpc", "n_kw", "groups", "category", "sample", "features"]
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for i, p in enumerate(build, 1):
        w.writerow({"rank": i, **{k: p.get(k) for k in cols if k != "rank"}})

# --- report ---
print(f"loaded {len(rows)} keyword rows  (A+B)")
print(f"keyword-level tiers: {dict(kw_tier)}")
print(f"RED reasons: {dict(sorted(red_reason.items(), key=lambda x:-x[1]))}")
print(f"\nKD-winnable keywords (non-RED, KD<={KD_MAX}, vol>={VOL_MIN}): {len(winnable)} "
      f"of {len(rows)-kw_tier['RED']} survivors")
print("KD-gate sensitivity (winnable keywords):")
for k in (10, 15, 20, 30):
    print(f"   KD<={k:>3}: {sum(1 for r in rows if r['tier']!='RED' and r['kd']<=k and r['vol']>=VOL_MIN):>6}")
g = sum(1 for p in build if p['tier']=='GREEN'); a = sum(1 for p in build if p['tier']=='AMBER')
print(f"\nwinnable PAGES (parent topics): {len(build)}  (GREEN={g}, AMBER={a})")

print(f"\n===== TOP 35 WINNABLE PAGES (KD<={KD_MAX}, ranked by real demand) =====")
for i, p in enumerate(build[:35], 1):
    print(f"{i:>2}. {p['tier'][0]} dem{p['demand']:>6} kd{p['head_kd']:>2}(min{p['min_kd']:>2}) "
          f"${p['top_cpc']:>5} n{p['n_kw']:>2} [{p['groups']}]  {p['head_kw']}")
print(f"\nfull build list -> {OUT}")
