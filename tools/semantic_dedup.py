#!/usr/bin/env python3
"""
Semantic dedup — heuristic, no API needed.
Finds same-job keyword pairs within each niche using:
  1. Synonym normalization (resurface=resurfacing=overlay, repair=fix=patch, etc.)
  2. Word-set Jaccard on normalized stems
  3. Keeps highest-volume slug per group
"""
import sys, json, csv, re
from pathlib import Path
from collections import defaultdict

ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files")
IN_FILE  = ROOT / "out/final-keywords.csv"
OUT_FILE = ROOT / "out/final-keywords-deduped.csv"
LOG_FILE = ROOT / "out/semantic-merge-log.json"

# Synonym groups — all words in a group normalize to the first word
SYNONYMS = [
    ["resurface", "resurfacing", "overlay", "recoat", "refinish"],
    ["repair", "fix", "patch", "restore", "restoration"],
    ["replace", "replacement", "install", "installation", "new"],
    ["cost", "price", "estimate", "pricing", "rates", "rate", "fee", "fees", "quote", "quotes", "cheap", "average"],
    ["driveway", "driveways"],
    ["concrete", "cement"],
    ["asphalt", "blacktop", "tarmac"],
    ["remove", "removal", "demo", "demolition", "tear", "tearout"],
    ["clean", "cleaning", "wash", "washing", "pressure"],
    ["seal", "sealing", "sealer", "sealcoat", "sealcoating"],
    ["paint", "painting", "repaint", "repainting", "stain", "staining"],
    ["roof", "roofing", "rooftop"],
    ["pool", "swimming"],
    ["heat", "heating", "heater"],
    ["cool", "cooling", "ac", "air", "conditioner", "conditioning", "hvac"],
    ["electric", "electrical", "wiring", "wire"],
    ["plumb", "plumbing", "pipe", "pipes"],
    ["deck", "decking"],
    ["fence", "fencing"],
    ["lawn", "grass", "sod", "turf"],
    ["window", "windows"],
    ["door", "doors"],
    ["floor", "flooring"],
    ["gutter", "gutters"],
    ["insulate", "insulation"],
    ["solar", "panel", "panels"],
    ["hot", "water", "heater"],
]

# Build lookup: word -> canonical
NORM = {}
for group in SYNONYMS:
    canon = group[0]
    for word in group:
        NORM[word] = canon

STOPWORDS = {"a", "an", "the", "to", "for", "of", "and", "or", "in", "on",
             "how", "much", "does", "what", "is", "are", "my", "your", "per",
             "calculator", "calc"}

def normalize(title: str) -> frozenset:
    words = re.sub(r"[^a-z0-9 ]", "", title.lower()).split()
    normed = set()
    for w in words:
        if w in STOPWORDS:
            continue
        normed.add(NORM.get(w, w))
    return frozenset(normed)

def jaccard(a, b):
    if not a or not b:
        return 0
    return len(a & b) / len(a | b)

def main():
    rows = list(csv.DictReader(open(IN_FILE, encoding="utf-8")))
    print(f"Input: {len(rows)} keywords")

    for r in rows:
        r["_norm"] = normalize(r["title"])
        r["_vol"] = int(r.get("search_volume") or 0)

    by_niche = defaultdict(list)
    for r in rows:
        by_niche[r["niche"]].append(r)

    to_remove = set()
    merge_log = []

    for niche, niche_rows in sorted(by_niche.items(), key=lambda x: -len(x[1])):
        merged_this_niche = []
        visited = set()

        for i, a in enumerate(niche_rows):
            if a["slug"] in visited or a["slug"] in to_remove:
                continue
            group = [a]
            for b in niche_rows[i+1:]:
                if b["slug"] in visited or b["slug"] in to_remove:
                    continue
                score = jaccard(a["_norm"], b["_norm"])
                if score >= 0.70:
                    group.append(b)
                    visited.add(b["slug"])

            if len(group) > 1:
                group.sort(key=lambda r: -r["_vol"])
                keeper = group[0]["slug"]
                dupes = [r["slug"] for r in group[1:]]
                to_remove.update(dupes)
                merged_this_niche.append({"keep": keeper, "remove": dupes,
                                          "titles": [r["title"] for r in group]})

        if merged_this_niche:
            print(f"  {niche}: {len(merged_this_niche)} merge groups")
            merge_log.extend(merged_this_niche)

    clean = [r for r in rows if r["slug"] not in to_remove]

    # Strip internal fields
    fieldnames = [k for k in rows[0].keys() if not k.startswith("_")]
    for r in clean:
        for k in list(r.keys()):
            if k.startswith("_"):
                del r[k]

    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(clean)

    LOG_FILE.write_text(json.dumps(merge_log, indent=2))

    print(f"\nMerged away: {len(to_remove)} duplicates")
    print(f"Final: {len(clean)} keywords")
    print(f"-> {OUT_FILE}")
    print(f"-> {LOG_FILE} (merge audit trail)")

    # Show sample merges
    print("\nSample merges:")
    for m in merge_log[:15]:
        print(f"  KEEP: {m['keep']}")
        for t in m['titles'][1:]:
            print(f"    DROP: {t}")

if __name__ == "__main__":
    main()
