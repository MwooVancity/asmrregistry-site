#!/usr/bin/env python3
"""Transform buildable construction keywords into calculator titles + dedup for cannibalization.

Rule: 1 calculator title = 1 page. Per-unit variants (per ton / per yard / per sq ft) and
quantity-specific phrasings (1500 sq ft, 1/4 mile, 500 gallon) collapse into ONE entity page;
those raw keywords become on-page keyword TARGETS, never their own URL.
Dedup key = (entity tokens incl. modifiers) + intent class (COST vs COMPUTE). Cost and volume
calculators for the same entity stay SEPARATE (different intent).
"""
import json, re, csv
from pathlib import Path

ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files")
allv = json.load(open(ROOT / "out" / "construction_ALL.json"))
build = [x for x in allv if x["tier"] in ("GOLD", "GREEN", "AMBER", "YMYL", "RED")]

# tokens to strip entirely (question / cost phrasing / filler) -- NOT entity modifiers
STOP = {
    "how", "much", "many", "does", "do", "it", "is", "are", "a", "an", "the", "of", "to",
    "for", "i", "need", "me", "my", "you", "with", "and", "in", "on", "near", "what",
    "average", "calculator", "calculate", "calc", "estimator", "estimate", "per", "cost",
    "costs", "price", "prices", "priced", "pricing", "vs", "into",
}
# absolute quantity + unit patterns to remove (keep entity, drop the example size)
QTY = re.compile(
    r"\b\d[\d,\.]*\s*"
    r"(sq\.?\s?ft|square\s?(foot|feet)|sq\s?feet|sqft|gallon|gallons|lb|lbs|pound|pounds|"
    r"mile|miles|ft|foot|feet|inch|inches|in|yard|yards|cubic|ton|tons|tonne|story|stories|"
    r"bag|bags|gauge|sq|piece|pieces)\b", re.I)
DIM = re.compile(r"\b\d+\s?x\s?\d+\b|\b\d+/\d+\b|\b\d[\d,\.]*\b", re.I)
UNITWORD = re.compile(r"\b(cubic|linear|square|sq|ft|foot|feet|yard|yards|ton|tons|gallon|gallons|"
                      r"inch|inches|lb|lbs|pound|pounds|mile|sqft)\b", re.I)
COST_RE = re.compile(r"\b(cost|costs|price|prices|pricing|\$|estimate|quote|worth|expensive)\b", re.I)
VOLUME_RE = re.compile(r"\bdo i need\b|\bhow many\b|\bcoverage\b|\bcover\b|\bneeded\b|\byield\b|\bweighs?\b|\bweight\b", re.I)
HOWMUCH_COST = re.compile(r"\bhow much (is|are|to |for |does |do )", re.I)


def cost_intent(kw):
    k = kw.lower()
    if COST_RE.search(k):
        return True
    if VOLUME_RE.search(k):           # "how much concrete do i need" = volume, not cost
        return False
    return bool(HOWMUCH_COST.search(k))

# safe synonym canonicalization (only where intent is unambiguous)
SYN = {"cement": "concrete", "top soil": "topsoil", "lvp": "luxury vinyl plank",
       "epdm": "epdm", "tpo": "tpo", "pvc": "pvc"}


def entity_tokens(kw):
    s = kw.lower()
    for a, b in SYN.items():
        s = re.sub(r"\b" + re.escape(a) + r"\b", b, s)
    s = QTY.sub(" ", s)
    s = DIM.sub(" ", s)
    s = UNITWORD.sub(" ", s)
    toks = [t for t in re.findall(r"[a-z]+", s) if t not in STOP]
    return toks


def title_of(kw, intent):
    toks = entity_tokens(kw)
    # de-dup repeated tokens, preserve order
    seen, ent = set(), []
    for t in toks:
        if t not in seen:
            seen.add(t); ent.append(t)
    phrase = " ".join(ent).strip()
    if not phrase:
        phrase = re.sub(r"[^a-z ]", "", kw.lower()).strip()
    label = phrase.title()
    if intent == "COST":
        return f"{label} Cost Calculator"
    return f"{label} Calculator"


rank = {"GOLD": 0, "GREEN": 1, "AMBER": 2, "YMYL": 3, "RED": 4}
# Grade ladder (priority high->low): API/cost pages = the moat, outrank no-API within a tier.
# Write EVERYTHING (only OFFTOPIC contaminants excluded upstream). LONGSHOT (red + no-API,
# no weak slot in top 5, near-unrankable) is built DEAD LAST. YMYL (structural) second-last.
GRADE = {("GOLD", "COST"): "PLAT", ("GOLD", "COMPUTE"): "GOLD",
         ("GREEN", "COST"): "SILVER", ("GREEN", "COMPUTE"): "BRONZE",
         ("AMBER", "COST"): "WOOD", ("AMBER", "COMPUTE"): "TRASH",
         ("RED", "COST"): "TRASH", ("RED", "COMPUTE"): "LONGSHOT",
         ("YMYL", "COST"): "YMYL", ("YMYL", "COMPUTE"): "YMYL"}
GRADE_RANK = {"PLAT": 0, "GOLD": 1, "SILVER": 2, "BRONZE": 3, "WOOD": 4,
              "TRASH": 5, "YMYL": 6, "LONGSHOT": 7}
groups = {}
for x in build:
    intent = "COST" if cost_intent(x["head"]) else "COMPUTE"
    ent = tuple(sorted(set(entity_tokens(x["head"]))))
    key = (ent, intent)
    title = title_of(x["head"], intent)
    g = groups.setdefault(key, {"title": title, "intent": intent, "members": [],
                                "demand": 0, "tier": "RED", "cpc": 0})
    g["members"].append(x["head"])
    g["demand"] += x.get("demand", 0)
    g["cpc"] = max(g["cpc"], x.get("cpc", 0) or 0)
    if rank[x["tier"]] < rank[g["tier"]]:
        g["tier"] = x["tier"]
    # prefer the shortest member as the title source (cleanest)
    if len(x["head"]) < len(min(g["members"], key=len)) + 1:
        g["title"] = title_of(x["head"], intent)

pages = list(groups.values())
for p in pages:
    p["grade"] = GRADE[(p["tier"], p["intent"])]
pages.sort(key=lambda p: (GRADE_RANK[p["grade"]], -p["demand"]))

print(f"buildable keywords in: {len(build)}")
print(f"canonical PAGES after cannibalization merge: {len(pages)}")
print(f"keywords folded as targets (cannibalization removed): {len(build) - len(pages)}")
by_tier = {}
for p in pages:
    by_tier.setdefault(p["tier"], [0, 0])
    by_tier[p["tier"]][0] += 1
    by_tier[p["tier"]][1] += p["demand"]
for t in ("GOLD", "GREEN", "AMBER"):
    if t in by_tier:
        print(f"  {t:<6} {by_tier[t][0]:>4} pages  {by_tier[t][1]:>8,} demand")

# write CSV
with open(ROOT / "out" / "construction_PAGES.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["priority", "grade", "tier", "calculator_title", "intent", "needs_api",
                "page_demand", "cpc", "n_keywords", "keyword_targets"])
    for i, p in enumerate(pages, 1):
        w.writerow([i, p["grade"], p["tier"], p["title"], p["intent"],
                    "yes" if p["intent"] == "COST" else "no", p["demand"], p["cpc"],
                    len(p["members"]), " | ".join(sorted(p["members"], key=lambda m: -len(m)))])

# grade summary (priority high->low)
print("\n===== GRADE LADDER (priority high->low) =====")
for g in ("PLAT", "GOLD", "SILVER", "BRONZE", "WOOD", "TRASH", "YMYL", "LONGSHOT"):
    gp = [p for p in pages if p["grade"] == g]
    if gp:
        print(f"  {g:<8} {len(gp):>3} pages  {sum(p['demand'] for p in gp):>8,}/mo")
print(f"  {'TOTAL':<8} {len(pages):>3} pages  {sum(p['demand'] for p in pages):>8,}/mo  <- write all, in this order")

# show cannibalization merges (groups with >1 member)
merges = sorted([p for p in pages if len(p["members"]) > 1], key=lambda p: -len(p["members"]))
print(f"\n{len(merges)} pages absorbed multiple keywords. Top merges:")
for p in merges[:15]:
    print(f"  [{p['tier']}] {p['title']}  <= {len(p['members'])} kw: " +
          ", ".join(sorted(p["members"], key=lambda m: -len(m))[:4]) +
          (" ..." if len(p["members"]) > 4 else ""))
print("\nwrote out/construction_PAGES.csv")
