#!/usr/bin/env python3
"""
Intent SERP check for calc-pages-index.json planned pages.

Pipeline:
  1. Load all planned pages, derive keyword from title
  2. TF-IDF cluster → deduplicate near-identical queries (cosine sim > 0.88)
  3. DataForSEO SERP call per unique cluster representative
  4. Classify: GREEN (calc wins), AMBER (mixed), RED (skip — products/articles dominate)
  5. Write output/intent-serp-results.json + output/intent-shortlist.json (GREEN only)

Usage:
  python tools/intent_serp_check.py              # full run
  python tools/intent_serp_check.py --limit 50   # test on first 50 slugs
  python tools/intent_serp_check.py --resume     # skip already-done slugs
"""
import sys, json, re, os, time, argparse
from pathlib import Path

ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files")
sys.path.insert(0, str(ROOT / "tools"))

import niche_calculator_miner as m

# ---------------------------------------------------------------------------
GIANTS = {
    "calculator.net", "omnicalculator.com", "calculatorsoup.com",
    "inchcalculator.com", "gigacalculator.com", "thecalculatorsite.com",
    "rapidtables.com", "easycalculation.com", "unitconverters.net",
    "metric-conversions.org", "convertunits.com", "calculateme.com",
    "checkyourmath.com", "conversion-metric.org",
}

CALC_SIGNALS = {"calculator", "calc", "compute", "converter", "conversion"}
PRODUCT_DOMAINS = {"amazon.com", "homedepot.com", "lowes.com", "walmart.com", "ebay.com", "etsy.com"}
ARTICLE_SIGNALS = {"wikihow.com", "thisoldhouse.com", "bobvila.com", "familyhandyman.com",
                   "thespruce.com", "hgtv.com", "hunker.com"}

OUT_DIR = ROOT / "out"
OUT_DIR.mkdir(exist_ok=True)
RESULTS_FILE = OUT_DIR / "intent-serp-results.json"
SHORTLIST_FILE = OUT_DIR / "intent-shortlist.json"

# ---------------------------------------------------------------------------

def title_to_keyword(title: str) -> str:
    """'Putting Green Turf Cost Calculator' -> 'putting green turf cost'"""
    kw = re.sub(r"\bcalculator\b", "", title, flags=re.IGNORECASE)
    kw = re.sub(r"\bcalc\b", "", kw, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", kw).strip().lower()


def tfidf_dedup(pages: list[dict], threshold: float = 0.88) -> list[dict]:
    """
    Group pages by keyword similarity. Return one representative per group.
    Representatives keep a 'cluster_members' list of all slugs in the group.
    """
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        import numpy as np
    except ImportError:
        print("scikit-learn not installed — skipping dedup, running all keywords")
        for p in pages:
            p["cluster_members"] = [p["slug"]]
        return pages

    keywords = [p["keyword"] for p in pages]
    vec = TfidfVectorizer(ngram_range=(1, 2), analyzer="word")
    matrix = vec.fit_transform(keywords)
    sim = cosine_similarity(matrix)

    assigned = [False] * len(pages)
    clusters = []
    for i in range(len(pages)):
        if assigned[i]:
            continue
        members = [i]
        for j in range(i + 1, len(pages)):
            if not assigned[j] and sim[i, j] >= threshold:
                members.append(j)
                assigned[j] = True
        assigned[i] = True
        rep = pages[i].copy()
        rep["cluster_members"] = [pages[k]["slug"] for k in members]
        clusters.append(rep)

    return clusters


def classify(serp_result: dict, keyword: str) -> dict:
    """Return verdict + signals from a compact_serp_slice result."""
    top10 = serp_result.get("organic_top10", [])
    top5_plds = [o.get("pld", "") for o in top10[:5]]

    aio = bool(serp_result.get("ai_overview"))
    widgets = serp_result.get("widgets", {})
    has_calc_box = any(widgets.get(t) for t in ("math_solver", "currency_box", "google_finance", "unit_converter"))
    paa = bool(widgets.get("people_also_ask"))

    giant_hits = [p for p in top5_plds if p in GIANTS]
    product_hits = [p for p in top5_plds if p in PRODUCT_DOMAINS]
    article_hits = [p for p in top5_plds if p in ARTICLE_SIGNALS]
    calc_hits = [p for p in top5_plds if any(s in p for s in CALC_SIGNALS)]

    # Intent signal from page types
    if len(product_hits) >= 2:
        intent = "PRODUCT"
    elif len(article_hits) >= 2 and not calc_hits and not giant_hits:
        intent = "INFO"
    elif calc_hits or giant_hits:
        intent = "COMPUTE"
    else:
        intent = "MIXED"

    # Giants in top 3 positions (hardest to displace)
    top3_plds = [o.get("pld", "") for o in top10[:3]]
    giants_top3 = [p for p in top3_plds if p in GIANTS]

    # Winnability verdict
    if has_calc_box and not aio and not giants_top3:
        verdict = "GREEN"  # calc box + no giant blocking top 3
    elif intent == "COMPUTE" and not giants_top3:
        verdict = "GREEN"  # calc intent, giants not in top 3
    elif intent == "COMPUTE" and len(giants_top3) == 1:
        verdict = "AMBER"  # one giant in top 3, winnable with effort
    elif intent == "COMPUTE" and len(giants_top3) >= 2:
        verdict = "RED"    # giants locked top 3, not year-1 winnable
    elif intent == "PRODUCT":
        verdict = "RED"
    elif intent == "INFO" and not aio:
        verdict = "AMBER"
    elif aio and intent != "COMPUTE":
        verdict = "RED"
    else:
        verdict = "AMBER"

    return {
        "verdict": verdict,
        "intent": intent,
        "aio": aio,
        "calc_box": has_calc_box,
        "paa": paa,
        "giants_top3": giants_top3,
        "giants_top5": giant_hits,
        "product_top5": product_hits,
        "top5": top5_plds,
    }


# Generic mega-domains that appear on thousands of SERPs — not query-specific, exclude from overlap
GENERIC_DOMAINS = {
    "reddit.com", "youtube.com", "amazon.com", "homedepot.com", "lowes.com",
    "walmart.com", "facebook.com", "instagram.com", "pinterest.com", "quora.com",
    "wikipedia.org", "yelp.com", "angieslist.com", "thumbtack.com", "google.com",
}

def cannibalization_check(results: list[dict]):
    """Pairwise SERP overlap on query-specific domains only. Flag pairs where >=3/5 match."""
    valid = [r for r in results if r.get("top5")]
    pairs = []
    for i in range(len(valid)):
        a = set(d for d in valid[i]["top5"] if d not in GENERIC_DOMAINS)
        for j in range(i + 1, len(valid)):
            b = set(d for d in valid[j]["top5"] if d not in GENERIC_DOMAINS)
            overlap = len(a & b)
            if overlap >= 3:
                pairs.append({
                    "slug_a": valid[i]["slug"],
                    "slug_b": valid[j]["slug"],
                    "keyword_a": valid[i]["keyword"],
                    "keyword_b": valid[j]["keyword"],
                    "overlap": overlap,
                    "shared_domains": list(a & b),
                })

    pairs.sort(key=lambda x: -x["overlap"])
    out = OUT_DIR / "cannibalization-pairs.json"
    out.write_text(json.dumps(pairs, indent=2))
    print(f"\nCannibalization pairs (overlap >=3/5): {len(pairs)}")
    for p in pairs[:20]:
        print(f"  [{p['overlap']}/5] {p['slug_a']} <-> {p['slug_b']}")
    print(f"-> {out}")


def load_existing_results() -> dict:
    if RESULTS_FILE.exists():
        data = json.loads(RESULTS_FILE.read_text())
        return {r["slug"]: r for r in data}
    return {}


def save_results(results: list[dict]):
    RESULTS_FILE.write_text(json.dumps(results, indent=2))
    print(f"Saved {len(results)} results -> {RESULTS_FILE}")


# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Process first N pages only")
    parser.add_argument("--resume", action="store_true", help="Skip already-processed slugs")
    parser.add_argument("--threshold", type=float, default=0.88, help="TF-IDF dedup similarity threshold")
    args = parser.parse_args()

    # Load planned pages
    index = json.loads((ROOT / "livedatacalc/src/data/calc-pages-index.json").read_text())
    planned = [p for p in index if p.get("pipelineStage") == "planned"]
    print(f"Planned pages: {len(planned)}")

    # Derive keywords
    for p in planned:
        p["keyword"] = title_to_keyword(p["title"])

    if args.limit:
        planned = planned[: args.limit]
        print(f"Limited to {args.limit} pages")

    # Dedup
    clusters = tfidf_dedup(planned, threshold=args.threshold)  # 0.92 default — avoids over-merging unit variants
    print(f"After dedup ({args.threshold} threshold): {len(clusters)} unique queries (saved {len(planned)-len(clusters)} calls)")

    # Resume support
    existing = load_existing_results() if args.resume else {}
    if existing:
        print(f"Resuming — {len(existing)} already done")

    # Load credentials from livedatacalc/.env
    env_path = ROOT / "livedatacalc/.env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

    # DataForSEO setup
    cfg = m.Config(serp_load_async_ai_overview=True, serp_device="desktop")
    api = m.DataForSEO(cfg)

    results = list(existing.values()) if args.resume else []
    done_slugs = set(existing.keys())

    to_run = [c for c in clusters if c["slug"] not in done_slugs]
    print(f"Querying {len(to_run)} keywords via DataForSEO...")

    for i, page in enumerate(to_run):
        kw = page["keyword"]
        slug = page["slug"]
        members = page.get("cluster_members", [slug])

        try:
            raw = api.serp(kw)
            sl = m.compact_serp_slice(cfg, kw, raw, None)
            signals = classify(sl, kw)
        except Exception as e:
            signals = {"verdict": "ERR", "intent": "ERR", "error": str(e)[:120]}

        row = {
            "slug": slug,
            "keyword": kw,
            "title": page["title"],
            "niche": page.get("niche", ""),
            "hub": page.get("hub"),
            "cluster_members": members,
            **signals,
        }
        results.append(row)

        v = signals.get("verdict", "ERR")
        top5 = signals.get("top5", [])
        print(f"[{i+1}/{len(to_run)}] {v:5} {kw[:45]:45} -> {', '.join(top5[:3])}")

        # Save checkpoint every 50
        if (i + 1) % 50 == 0:
            save_results(results)

        time.sleep(0.05)

    save_results(results)
    cannibalization_check(results)


if __name__ == "__main__":
    main()
