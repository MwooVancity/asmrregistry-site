#!/usr/bin/env python3
"""
Fetch Google Ads search volume for clean-keywords.json, filter <100/mo, save final list.

Usage: python tools/volume_filter.py
"""
import sys, json, os, csv, re
from pathlib import Path

ROOT = Path(r"C:\Users\mwoo7\Downloads\claude files")
sys.path.insert(0, str(ROOT / "tools"))
import niche_calculator_miner as m

OUT_DIR = ROOT / "out"

def title_to_keyword(title: str) -> str:
    kw = re.sub(r"\bcalculator\b", "", title, flags=re.IGNORECASE)
    kw = re.sub(r"\bcalc\b", "", kw, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", kw).strip().lower()

# Load creds
env_path = ROOT / "livedatacalc/.env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

cfg = m.Config()
api = m.DataForSEO(cfg)

pages = json.load(open(OUT_DIR / "clean-keywords.json", encoding="utf-8"))
print(f"Fetching volume for {len(pages)} keywords...")

keywords = [title_to_keyword(p["title"]) for p in pages]
vol_map = api.google_ads_search_volume(keywords)
print(f"Got volume data for {len(vol_map)} keywords")

# Attach volume to pages
for p, kw in zip(pages, keywords):
    data = vol_map.get(kw, {})
    p["keyword"] = kw
    p["search_volume"] = data.get("search_volume") or 0
    p["cpc"] = data.get("cpc")
    p["competition_index"] = data.get("competition_index")

# Save full results with volume
json.dump(pages, open(OUT_DIR / "keywords-with-volume.json", "w"), indent=2)

# Filter >=100
final = [p for p in pages if p["search_volume"] >= 100]
final.sort(key=lambda x: -x["search_volume"])

json.dump(final, open(OUT_DIR / "final-keywords.json", "w"), indent=2)

with open(OUT_DIR / "final-keywords.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["slug", "title", "keyword", "search_volume", "cpc", "niche", "hub"])
    for p in final:
        w.writerow([p["slug"], p["title"], p["keyword"], p["search_volume"], p.get("cpc",""), p.get("niche",""), p.get("hub","")])

print(f"\nTotal clean keywords: {len(pages)}")
print(f">=100/mo: {len(final)}")
print(f"Dropped (zero/low volume): {len(pages)-len(final)}")
print(f"-> out/final-keywords.csv")
print(f"\nTop 20 by volume:")
for p in final[:20]:
    print(f"  {p['search_volume']:>8,}  {p['title']}")
