#!/usr/bin/env python3
"""
niche_calculator_miner.py
=========================
Resumable hybrid pipeline that mines ultra-low-competition *calculator* keywords
and groups survivors into buildable hub-and-spoke niche clusters, so one DR~0
domain can host multiple deconflicted silos. Target: brand-new domain, US/English.

ARCHITECTURE IS HYBRID (the split is load-bearing — keep it clean):
  - Deterministic Python  ->  fetch, demand gates, clustering, state, audit.
  - Claude-over-JSON      ->  the two judgments that need a *read of the real SERP*:
                             (1) difficulty, (2) whether an AI Overview actually
                             steals tool intent.
  Claude NEVER adjudicates demand or index-bloat (deterministic).
  Python NEVER guesses difficulty from a number (that is Claude reading the SERP).

THE BINDING CONSTRAINT is NOT API cost. It is Google's tolerance for thin pages
(index bloat) and Claude's adjudication throughput. Architect around
page-worthiness, not around conserving calls. Every threshold is a tunable CONFIG
constant with a default + rationale.

GROUND RULES ON API FACTS: real DataForSEO paths/fields/ranges are used where
they were verified against a live working caller in this repo
(muniengine/scripts/rederive/serp-buildplans.mjs). Anything NOT directly observed
against the live API is tagged `# VERIFY` — never silently accepted. Mocks only
prove the parser matches an assumption, so `--validate` fires ONE live call per
endpoint and asserts the expected field paths exist before any bulk run. Live JSON
is the schema source of truth.

Stack: requests + stdlib + tldextract (PLD) + anthropic (Claude adjudication).
  pip install requests tldextract anthropic
(anthropic is only needed for the live adjudication stage; --validate and --mock
 run without it.)

Usage:
  python niche_calculator_miner.py --validate                 # 1 live call/endpoint, assert field paths
  python niche_calculator_miner.py --mock                     # offline end-to-end on bundled fixtures
  python niche_calculator_miner.py --run --seed-roots "concrete calculator,grading calculator"
  python niche_calculator_miner.py --run                      # resume in-progress run from SQLite, no re-fetch
  python niche_calculator_miner.py --export                   # (re)emit CSVs from current SQLite state

Pipeline order (difficulty runs AFTER demand because demand routes which SERPs
are worth reading):
  seed -> intent gate -> demand gate (avg + seasonality rescue, two floors)
       -> cluster (PLD SERP-overlap) -> Claude SERP-difficulty adjudication
          (routed by demand, inherited at cluster level)
       -> cluster viability + deconfliction -> export
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sqlite3
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Iterable, Optional

import requests

try:
    import tldextract  # PLD extraction via the Public Suffix List
    _TLDX = tldextract.TLDExtract(suffix_list_urls=())  # offline PSL snapshot; no network at import
except Exception:  # pragma: no cover - import guard
    _TLDX = None

try:
    anthropic = None  # BANNED: Claude API credits must never be used
except Exception:  # pragma: no cover - import guard
    anthropic = None


# =============================================================================
# 1. CONFIG  (@dataclass — every value is a tunable with default + rationale)
# =============================================================================

@dataclass(frozen=True)
class Config:
    # ---- Auth ----------------------------------------------------------------
    # DataForSEO Basic auth: base64("login:password"). The repo already stores it
    # as DATAFORSEO_B64 in .env (see serp-buildplans.mjs). We also accept
    # DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD and build the header ourselves.
    dataforseo_b64_env: str = "DATAFORSEO_B64"
    dataforseo_login_env: str = "DATAFORSEO_LOGIN"
    dataforseo_password_env: str = "DATAFORSEO_PASSWORD"
    env_files: tuple[str, ...] = (".env", "muniengine/.env")  # searched in order, first hit wins
    api_base: str = "https://api.dataforseo.com/v3/"

    # ---- Anthropic (Claude adjudication) ------------------------------------
    anthropic_api_key_env: str = "ANTHROPIC_API_KEY"
    # Default per Anthropic guidance: claude-opus-4-8 (most capable). The master
    # spec frames "Claude adjudication throughput" as a binding constraint — if you
    # need to trade intelligence for throughput/cost on the per-SERP reads, set this
    # to "claude-sonnet-4-6" or "claude-haiku-4-5". It is a knob ON PURPOSE.
    claude_model: str = "claude-opus-4-8"
    # Difficulty is a genuine judgment (read the SERP, weigh saturation x authority),
    # so adaptive thinking is on; "medium" effort balances quality vs throughput on a
    # high-volume per-keyword loop. Raise to "high" for borderline clusters.
    claude_effort: str = "medium"
    claude_max_tokens: int = 1200

    # ---- Locale --------------------------------------------------------------
    location_code: int = 2840  # United States
    language_code: str = "en"

    # ---- Seed roots ----------------------------------------------------------
    # Calculator-intent roots. Override on the CLI with --seed-roots.
    seed_roots: tuple[str, ...] = (
        "concrete calculator",
        "grading calculator",
        "fence calculator",
        "mulch calculator",
        "gravel calculator",
    )
    # Seeder choice (HARD RULE 1):
    #   "entity"      = keyword_suggestions/live on the bare ENTITY ("concrete") + keep only
    #     tool-intent terms. DISCOVERS the niche's DISTINCT calculators (volume, cost, psi,
    #     water-cement ratio, cure time, rebar, block...). DEFAULT. The unit of a niche is the
    #     entity; the unit of a PAGE is a distinct computation; a cluster of query-variants
    #     ("yards/bags/cubic/brand of concrete calculator") is ONE page, not a silo.
    #   "suggestions" = keyword_suggestions/live on a phrase ("concrete cost calculator") ->
    #     the VARIANTS of one computation (use to deepen one page's keyword targets).
    #   "ideas"       = keyword_ideas/live -> broad semantic CATEGORY (off-entity siblings).
    # LIVE FINDING (2026-06-06): suggestions("concrete calculator") returned ~80 phrasings of
    # ONE volume calculator (yards/bags/brand) -> that is the "calc niche" (one tool), NOT the
    # "concrete niche" (many distinct tools). Entity-seed + tool filter surfaces the real set.
    seeder: str = "entity"
    # In entity mode, a candidate must carry a tool-intent token (calculator/calc/estimator/
    # cost/how much...) to be kept -- this is what turns "all concrete terms" into "concrete
    # calculators". (tool_intent_tokens, defined below.)
    entity_seed_require_tool_token: bool = True
    # SERP-candidate sampling. "diverse" picks one representative per distinct token SIGNATURE
    # first (so psi/cure/ratio/cost each get a SERP read even though they are lower-volume than
    # the volume variants), then fills remaining --limit by volume. "volume" = pure top-N (only
    # right when deepening ONE page's variants). Generic/unit filler tokens are not signatures.
    serp_sample: str = "diverse"
    signature_filler_tokens: tuple[str, ...] = (
        "of", "for", "by", "the", "in", "and", "a", "to", "online", "free", "my",
        "calculator", "calc", "estimator", "estimate", "converter", "conversion",
    )
    # keyword_ideas depth: 2 for discovery; bump a STARVED root to 4 only when a
    # single root yields too few intent+demand survivors (HARD RULE 1).
    related_depth: int = 2
    related_depth_starved: int = 4
    starved_root_threshold: int = 12  # < this many survivors per root => allow depth 4 rerun

    # ---- HARD RULE 2: demand is the gate AND the attention router ------------
    # Selection metric is the ANNUAL AVERAGE (keyword_info.search_volume), robust
    # to single-month Ads-estimation noise. We never SELECT on peak.
    harvest_floor: int = 0          # vol-0 variants are content inputs (FAQ/copy), never their own URL
    # Server-side filter on keyword_ideas to keep the discovery payload sane. Terms
    # in [harvest_floor, adjudicate_min_avg_vol) are STORED as harvest content inputs
    # but are NOT sent to the expensive SERP/Claude stage on their own.
    seed_server_min_vol: int = 10
    # A term earns a *read of its SERP* (Claude attention) only at/above this avg,
    # OR via seasonality rescue below. Minting a URL still additionally requires
    # cluster membership + the cluster clearing aggregate demand (MINT_URL).
    adjudicate_min_avg_vol: int = 70

    # Seasonality rescue: a high peak/avg ratio RESCUES a seasonal term the average
    # would kill, and FLAGS publish timing. Peak never selects alone.
    seasonality_rescue_ratio: float = 2.5   # peak_3mo_avg / annual_avg >= this => eligible to rescue
    seasonality_peak_min_vol: int = 140      # ...AND peak_3mo_avg must itself clear this to rescue

    # Competition is SORT-ONLY, never a gate (flags highest-CPC monetizable terms).
    # Stored as competition_float (0..1) from Labs keyword_info.competition. NEVER in
    # a column named *_index (the 0..100 field exists only on Google Ads search_volume).

    # ---- HARD RULE 3: KD is a feature, not a gate ---------------------------
    # keyword_difficulty is passed through as evidence inside Axis B only. We do NOT
    # gate on it. Optional ultra-loose sanity cap; None = disabled (recommended).
    kd_sanity_cap: Optional[int] = None  # e.g. 92 to drop only the most brutal heads; default off

    # ---- HARD RULE 4: intent gate (deterministic) ---------------------------
    keep_intents: tuple[str, ...] = ("transactional", "commercial")
    allow_informational_secondary: bool = True  # info allowed only as secondary on a txn/comm primary
    # LIVE FINDING (2026-06-05 --validate): DataForSEO labels calculator HEADS as
    # 'informational' (e.g. "concrete calculator" -> informational), so a strict
    # transactional/commercial primary gate drops exactly the high-value heads this
    # tool targets. Carve-out: keep an informational/navigational primary when the
    # keyword carries explicit TOOL intent (a calc token) OR has a txn/comm secondary.
    # This is the spec's HARD RULE 4 corrected against live data, not loosened: pure
    # informational terms with no tool token and no commercial secondary still drop.
    calc_token_intent_override: bool = True
    tool_intent_tokens: tuple[str, ...] = (
        "calculator", "calc", "estimator", "estimate", "converter", "conversion", "how much",
    )
    # LIVE FINDING (2026-06-06 first bulk run): keyword_ideas("concrete calculator")
    # expands to the entire CALCULATOR CATEGORY -- "calculator" (24.9M), "bmi calculator",
    # "gpa calculator", etc. 0/50 top-volume results contained "concrete". Seeding from
    # keyword_ideas (HARD RULE 1) returns category siblings, NOT the entity sub-niche.
    # Entity discipline: a candidate must carry the seed root's ENTITY token (the root
    # minus its tool word) to be eligible for SERP/clustering. "concrete calculator" ->
    # entity "concrete"; "fence calculator" -> "fence". This also separates contaminants
    # by stem ("grading" keeps land-grading, drops school "grade calculator").
    require_root_entity_token: bool = True
    negative_tokens: tuple[str, ...] = (
        "jobs", "salary", "near me", "login", "log in", "free download", "download free",
        "coupon", "promo code", "for sale", "rental", "rent ", "hire",
    )
    # Brand tokens to exclude (calculator-niche incumbents — expand per run).
    brand_negative_tokens: tuple[str, ...] = (
        "omni", "omnicalculator", "calculator.net", "calculatorsoup", "inch calculator",
        "gigacalculator", "rapidtables",
    )
    # Optional positive include tokens; empty = accept any non-excluded.
    include_tokens: tuple[str, ...] = ()

    # ---- HARD RULE 5: SERP pull params --------------------------------------
    serp_device: str = "mobile"        # primary index, worst feature-crowding
    serp_depth: int = 20
    serp_load_async_ai_overview: bool = True   # NON-NEGOTIABLE — without it the AIO is absent from JSON
    serp_paa_click_depth: int = 1
    serp_group_organic: bool = True
    # SERP item types that compute the answer inline => instant hard-kill (Step 1).
    # `# VERIFY` exact spellings against a live SERP that triggers each widget.
    kill_switch_item_types: tuple[str, ...] = (
        "math_solver",       # VERIFY
        "currency_box",      # VERIFY
        "google_finance",    # VERIFY
    )

    # ---- HARD RULE 6: clustering --------------------------------------------
    # Aggregators co-rank across unrelated niches; strip BEFORE overlap math or
    # union-find chains everything into one blob via connected components.
    aggregator_stopword_domains: tuple[str, ...] = (
        "calculator.net", "omnicalculator.com", "calculatorsoup.com", "gigacalculator.com",
        "rapidtables.com", "inchcalculator.com", "wikipedia.org", "wikihow.com",
        "youtube.com", "reddit.com", "quora.com", "pinterest.com", "facebook.com",
        "amazon.com", "ebay.com", "etsy.com", "homedepot.com", "lowes.com",
    )
    serp_top_n_urls: int = 10           # top_n_urls used for overlap
    # IDF-weighted overlap is the default; a shared rare PLD counts more than a
    # shared common one. Two keywords are linked when their weighted shared-PLD
    # score >= this. Tune up if clusters bloat (residual aggregator contamination).
    idf_overlap_min: float = 1.6
    # Unweighted raw-count fallback (only used if --overlap-mode raw).
    serp_overlap_min: int = 3
    serp_overlap_strict: int = 4
    cluster_sanity_max_size: int = 60   # warn if a cluster exceeds this (likely contamination)

    # ---- HARD RULE 7: cluster viability + deconfliction ---------------------
    min_cluster_size: int = 8
    # Total cluster volume from the TOP-N terms' robust average — NOT a sum of noise
    # buckets. NEVER relaxed to rescue a thin run (that is the deindexing trigger).
    min_total_cluster_volume: int = 500
    cluster_volume_top_n: int = 8
    cross_cluster_overlap_max: float = 0.30  # cleaned-domain Jaccard above this => merge-or-drop flag

    # ---- I/O -----------------------------------------------------------------
    db_path: str = "out/niche_miner.sqlite"
    # A CLUSTER = one PAGE (one distinct computation). pages.csv = one row per buildable page;
    # targets.csv = one row per keyword mapped to ITS page (query variants are keyword targets
    # ON a page, never their own URL -- that would be variant doorway pages / index bloat).
    csv_pages_path: str = "out/niche_pages.csv"
    csv_targets_path: str = "out/niche_targets.csv"
    http_timeout: int = 90
    http_retries: int = 3
    http_backoff_s: float = 2.0
    polite_sleep_s: float = 0.0  # between SERP calls if you want to throttle


CFG = Config()


# =============================================================================
# Stage constants (per-keyword pipeline position, persisted for resume)
# =============================================================================
class Stage:
    SEEDED = "seeded"
    INTENT_PASS = "intent_pass"
    INTENT_DROP = "intent_drop"
    HARVEST = "harvest"            # passed intent, below adjudicate floor => content input only
    DEMAND_CANDIDATE = "demand_candidate"  # eligible for SERP read (avg or seasonality rescue)
    CLUSTERED = "clustered"
    ADJUDICATED = "adjudicated"
    EXPORTED = "exported"


# =============================================================================
# 2. STATE / SQLite  (per-keyword stage + persisted top-10 PLD set + cluster_id
#    + Claude verdict; resume without re-fetch; correct column names)
# =============================================================================

_SCHEMA = """
CREATE TABLE IF NOT EXISTS keywords (
    keyword             TEXT PRIMARY KEY,
    seed_root           TEXT,
    stage               TEXT,
    -- demand (deterministic) -------------------------------------------------
    search_volume       INTEGER,   -- keyword_info.search_volume (annual avg) = SELECTION metric
    peak_3mo_avg        REAL,      -- mean of top-3 monthly_searches buckets
    seasonality_ratio   REAL,      -- peak_3mo_avg / search_volume
    peak_month          TEXT,      -- "YYYY-MM" of the single highest month (publish-timing flag)
    seasonality_rescued INTEGER DEFAULT 0,
    -- pass-through evidence (NOT gates) --------------------------------------
    keyword_difficulty  INTEGER,   -- keyword_properties.keyword_difficulty (Axis-B evidence only)
    competition_float   REAL,      -- keyword_info.competition (0..1) -- NEVER a *_index column
    cpc                 REAL,      -- keyword_info.cpc
    intent              TEXT,      -- real label written from search_intent API
    intent_secondary    TEXT,      -- JSON array of secondary labels
    -- clustering -------------------------------------------------------------
    plds                TEXT,      -- JSON array: aggregator-stripped top-N pay-level domains
    cluster_id          INTEGER,
    cluster_role        TEXT,      -- 'hub' | 'spoke'
    -- Claude verdict (the audit trail) ---------------------------------------
    kill_switch         TEXT,
    tool_saturation     TEXT,
    authority_floor     TEXT,
    aio                 TEXT,
    serp_difficulty     TEXT,
    beatable_by_tool    INTEGER,
    verdict             TEXT,      -- 'keep' | 'keep-prime' | 'defer' | 'drop'
    reason              TEXT,      -- mandatory provenance: lets a human replay the decision
    verdict_inherited   INTEGER DEFAULT 0,  -- 1 if inherited from cluster pillar
    updated_at          REAL
);

CREATE TABLE IF NOT EXISTS serp_raw (
    keyword     TEXT PRIMARY KEY,
    item_types  TEXT,   -- JSON array of distinct item types seen
    slice_json  TEXT,   -- compact slice handed to Claude (audit)
    fetched_at  REAL
);

CREATE TABLE IF NOT EXISTS clusters (
    cluster_id          INTEGER PRIMARY KEY,
    pillar_keyword      TEXT,
    keyword_count       INTEGER,
    total_volume_topn   INTEGER,
    avg_kd              REAL,
    sweet_spot_flag     INTEGER,   -- gap-under-high-authority (the prime opportunity)
    deconfliction_flag  INTEGER,
    serp_difficulty     TEXT,
    hub_url             TEXT,
    spoke_count         INTEGER,
    viable              INTEGER
);

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
"""


class State:
    def __init__(self, path: str):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(_SCHEMA)
        self.db.commit()

    # -- keyword upserts -------------------------------------------------------
    def upsert_seed(self, kw: str, seed_root: str, fields: dict[str, Any]) -> None:
        cols = {"keyword": kw, "seed_root": seed_root, "stage": Stage.SEEDED,
                "updated_at": _now(), **fields}
        keys = ",".join(cols)
        ph = ",".join("?" for _ in cols)
        upd = ",".join(f"{k}=excluded.{k}" for k in cols if k != "keyword")
        self.db.execute(
            f"INSERT INTO keywords ({keys}) VALUES ({ph}) "
            f"ON CONFLICT(keyword) DO UPDATE SET {upd}",
            list(cols.values()),
        )

    def update(self, kw: str, **fields) -> None:
        fields["updated_at"] = _now()
        sets = ",".join(f"{k}=?" for k in fields)
        self.db.execute(f"UPDATE keywords SET {sets} WHERE keyword=?",
                        [*fields.values(), kw])

    def set_serp(self, kw: str, item_types: list[str], slice_obj: dict) -> None:
        self.db.execute(
            "INSERT INTO serp_raw (keyword,item_types,slice_json,fetched_at) VALUES (?,?,?,?) "
            "ON CONFLICT(keyword) DO UPDATE SET item_types=excluded.item_types,"
            "slice_json=excluded.slice_json,fetched_at=excluded.fetched_at",
            [kw, json.dumps(item_types), json.dumps(slice_obj), _now()],
        )

    def get_serp_slice(self, kw: str) -> Optional[dict]:
        r = self.db.execute("SELECT slice_json FROM serp_raw WHERE keyword=?", [kw]).fetchone()
        return json.loads(r["slice_json"]) if r and r["slice_json"] else None

    def rows(self, where: str = "", params: Iterable = ()) -> list[sqlite3.Row]:
        q = "SELECT * FROM keywords"
        if where:
            q += f" WHERE {where}"
        return self.db.execute(q, list(params)).fetchall()

    def write_cluster(self, c: dict) -> None:
        keys = ",".join(c)
        ph = ",".join("?" for _ in c)
        upd = ",".join(f"{k}=excluded.{k}" for k in c if k != "cluster_id")
        self.db.execute(
            f"INSERT INTO clusters ({keys}) VALUES ({ph}) "
            f"ON CONFLICT(cluster_id) DO UPDATE SET {upd}",
            list(c.values()),
        )

    def clusters(self) -> list[sqlite3.Row]:
        return self.db.execute("SELECT * FROM clusters").fetchall()

    def commit(self) -> None:
        self.db.commit()


def _now() -> float:
    # Wall-clock for audit timestamps only. Imported lazily so the module stays
    # import-clean; never used to drive control flow.
    return time.time()


# =============================================================================
# DataForSEO client
# =============================================================================

class DataForSEO:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.auth = _load_dataforseo_auth(cfg)
        self.total_cost = 0.0

    def _post(self, path: str, body: list[dict]) -> dict:
        url = self.cfg.api_base + path
        headers = {"Authorization": "Basic " + self.auth, "Content-Type": "application/json"}
        last_exc: Optional[Exception] = None
        for attempt in range(1, self.cfg.http_retries + 1):
            try:
                r = requests.post(url, headers=headers, data=json.dumps(body),
                                  timeout=self.cfg.http_timeout)
                r.raise_for_status()
                j = r.json()
                self.total_cost += float(j.get("cost", 0) or 0)
                return j
            except Exception as e:  # noqa: BLE001 - retry on any transport error
                last_exc = e
                if attempt < self.cfg.http_retries:
                    time.sleep(self.cfg.http_backoff_s * attempt)
        raise RuntimeError(f"DataForSEO POST {path} failed after {self.cfg.http_retries} tries: {last_exc}")

    @staticmethod
    def _task0(j: dict) -> dict:
        tasks = j.get("tasks") or []
        if not tasks:
            raise RuntimeError(f"no tasks in response: {json.dumps(j)[:300]}")
        t = tasks[0]
        if t.get("status_code") != 20000:
            raise RuntimeError(f"task error {t.get('status_code')}: {t.get('status_message')}")
        return t

    # ---- HARD RULE 1: seed from keyword_ideas (returns ALL metrics) ---------
    def keyword_ideas(self, root: str, depth: int, min_vol: int) -> list[dict]:
        body = [{
            "keywords": [root],
            "location_code": self.cfg.location_code,
            "language_code": self.cfg.language_code,
            "limit": 1000,
            # Server-side filter: only pull terms at/above the harvest server floor,
            # so a vol filter does NOT drop 100% (which it WOULD on bulk_keyword_difficulty,
            # which returns only keyword+KD with no keyword_info — never seed from that).
            "filters": [["keyword_info.search_volume", ">=", min_vol]],
            "order_by": ["keyword_info.search_volume,desc"],
            # NOTE: keyword_ideas does not take a literal "depth"; closeness/expansion is
            # controlled server-side. `depth` here is a no-op placeholder kept for the
            # starved-root rerun semantics. # VERIFY whether keyword_suggestions/depth fits better.
        }]
        j = self._post("dataforseo_labs/google/keyword_ideas/live", body)
        t = self._task0(j)
        items = (t.get("result") or [{}])[0].get("items") or []
        return items

    def keyword_suggestions(self, seed: str, min_vol: int) -> list[dict]:
        """Full-text suggestions: keywords that CONTAIN the seed phrase (entity-coherent).
        Same Labs item shape (keyword_info/keyword_properties) as keyword_ideas.
        # VERIFY: singular `keyword` param + that items carry keyword_info (asserted by --validate).
        """
        body = [{
            "keyword": seed,
            "location_code": self.cfg.location_code,
            "language_code": self.cfg.language_code,
            "limit": 1000,
            "filters": [["keyword_info.search_volume", ">=", min_vol]],
            "order_by": ["keyword_info.search_volume,desc"],
        }]
        j = self._post("dataforseo_labs/google/keyword_suggestions/live", body)
        t = self._task0(j)
        return (t.get("result") or [{}])[0].get("items") or []

    def google_ads_search_volume(self, keywords: list[str]) -> dict[str, dict]:
        """Batch volume for many heads (used by the discovery engine to rank the niche
        universe by demand before SERP-scanning). One call per <=1000 keywords. Returns
        keyword -> {search_volume, competition (0..1 OR 0..100 index here -- Ads field),
        cpc}. # VERIFY: google_ads search_volume `competition_index` is 0..100, distinct
        from Labs keyword_info.competition (0..1) -- do not conflate."""
        out: dict[str, dict] = {}
        for chunk in _chunks(keywords, 1000):
            body = [{"keywords": chunk, "location_code": self.cfg.location_code,
                     "language_code": self.cfg.language_code}]
            j = self._post("keywords_data/google_ads/search_volume/live", body)
            t = self._task0(j)
            for r in (t.get("result") or []):
                out[r.get("keyword")] = {
                    "search_volume": r.get("search_volume"),
                    "competition_index": r.get("competition_index"),  # 0..100 (Ads), NOT _float
                    "cpc": r.get("cpc"),
                }
        return out

    def seed_terms(self, root: str, min_vol: int) -> list[dict]:
        """Dispatch to the configured seeder (HARD RULE 1)."""
        if self.cfg.seeder == "ideas":
            return self.keyword_ideas(root, self.cfg.related_depth, min_vol)
        return self.keyword_suggestions(root, min_vol)

    # ---- HARD RULE 4: search intent -----------------------------------------
    def search_intent(self, keywords: list[str]) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for chunk in _chunks(keywords, 1000):  # API caps batch size; chunk defensively
            body = [{
                "keywords": chunk,
                "language_code": self.cfg.language_code,
                # search_intent is language-scoped; location not required. # VERIFY
            }]
            j = self._post("dataforseo_labs/google/search_intent/live", body)
            t = self._task0(j)
            for it in (t.get("result") or [{}])[0].get("items") or []:
                out[it.get("keyword")] = it
        return out

    # ---- HARD RULE 5: SERP fetch (live/advanced; async AIO flag) -------------
    def serp(self, keyword: str) -> dict:
        # The repo's proven caller uses serp/google/organic/live/advanced. The async
        # AIO is requested via load_async_ai_overview (NON-NEGOTIABLE). The master spec
        # also describes task_post -> task_get/advanced; live/advanced is the single-call
        # equivalent and is what is validated against the live API here. # VERIFY that the
        # live endpoint honors load_async_ai_overview (it is documented on the advanced SERP).
        body = [{
            "keyword": keyword,
            "location_code": self.cfg.location_code,
            "language_code": self.cfg.language_code,
            "device": self.cfg.serp_device,
            "depth": self.cfg.serp_depth,
            "load_async_ai_overview": self.cfg.serp_load_async_ai_overview,
            "people_also_ask_click_depth": self.cfg.serp_paa_click_depth,
            "group_organic_results": self.cfg.serp_group_organic,
        }]
        j = self._post("serp/google/organic/live/advanced", body)
        t = self._task0(j)
        return (t.get("result") or [{}])[0]


def _load_dataforseo_auth(cfg: Config) -> str:
    # 1) explicit base64 in env
    b64 = os.environ.get(cfg.dataforseo_b64_env)
    if b64:
        return b64.strip()
    # 2) login/password in env -> build base64
    login = os.environ.get(cfg.dataforseo_login_env)
    pwd = os.environ.get(cfg.dataforseo_password_env)
    if login and pwd:
        import base64
        return base64.b64encode(f"{login}:{pwd}".encode()).decode()
    # 3) scan .env files for DATAFORSEO_B64=... (repo convention)
    for ef in cfg.env_files:
        p = Path(ef)
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line.startswith(f"{cfg.dataforseo_b64_env}="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError(
        f"No DataForSEO auth. Set {cfg.dataforseo_b64_env} (base64 login:password) "
        f"in env or one of {cfg.env_files}, or set "
        f"{cfg.dataforseo_login_env}/{cfg.dataforseo_password_env}."
    )


def _chunks(xs: list, n: int) -> Iterable[list]:
    for i in range(0, len(xs), n):
        yield xs[i:i + n]


# =============================================================================
# Pure parsing/extraction helpers (deterministic; unit-testable on mocks)
# =============================================================================

def root_entity_tokens(cfg: Config, root: str) -> list[str]:
    """The seed root minus its tool word(s) = the entity the niche is about.
    'concrete calculator' -> ['concrete']; 'concrete slab calculator' -> ['concrete','slab'].
    A candidate must contain at least one of these to be on-entity.
    """
    words = root.lower().split()
    tool = {t.lower() for t in cfg.tool_intent_tokens if " " not in t}
    return [w for w in words if w not in tool] or words


def on_entity(cfg: Config, root: str, keyword: str) -> bool:
    if not cfg.require_root_entity_token:
        return True
    low = keyword.lower()
    return any(tok in low for tok in root_entity_tokens(cfg, root))


def has_tool_token(cfg: Config, keyword: str) -> bool:
    low = keyword.lower()
    return any(t.lower() in low for t in cfg.tool_intent_tokens)


def keyword_signature(cfg: Config, root: str, keyword: str) -> frozenset:
    """The DISTINGUISHING tokens of a keyword = its words minus the entity, the tool word,
    and generic/unit filler. This approximates the COMPUTATION the keyword asks for, so the
    SERP sampler can cover distinct computations (psi/cure/ratio/cost) rather than re-sampling
    volume-variants. 'concrete psi calculator'->{'psi'}; 'yards of concrete calculator'->{'yards'};
    'concrete slab cost calculator'->{'slab','cost'}; bare 'concrete calculator'->frozenset()."""
    entity = set(root_entity_tokens(cfg, root))
    filler = {t.lower() for t in cfg.signature_filler_tokens}
    toks = [w for w in keyword.lower().split() if w not in entity and w not in filler]
    return frozenset(toks)


def parse_demand(item: dict) -> dict:
    """Extract demand fields from a keyword_ideas item.
    Field paths from HARD RULE 1: keyword_info.{search_volume,monthly_searches,
    competition,cpc}, keyword_properties.keyword_difficulty. # VERIFY against live JSON.
    """
    ki = item.get("keyword_info") or {}
    kp = item.get("keyword_properties") or {}
    avg = ki.get("search_volume")
    months = ki.get("monthly_searches") or []
    peak_3mo, ratio, peak_month = _seasonality(avg, months)
    return {
        "search_volume": _int(avg),
        "peak_3mo_avg": peak_3mo,
        "seasonality_ratio": ratio,
        "peak_month": peak_month,
        "competition_float": _float(ki.get("competition")),  # 0..1; NOT a *_index field
        "cpc": _float(ki.get("cpc")),
        "keyword_difficulty": _int(kp.get("keyword_difficulty")),
    }


def _seasonality(avg, months: list[dict]) -> tuple[Optional[float], Optional[float], Optional[str]]:
    vols = []
    for m in months:
        v = m.get("search_volume")
        if v is None:
            continue
        vols.append((v, m.get("year"), m.get("month")))
    if not vols:
        return None, None, None
    vols_sorted = sorted(vols, key=lambda x: x[0], reverse=True)
    top3 = vols_sorted[:3]
    peak_3mo = sum(v for v, _, _ in top3) / len(top3)
    peak_v, peak_y, peak_m = vols_sorted[0]
    peak_month = f"{peak_y}-{int(peak_m):02d}" if peak_y and peak_m else None
    ratio = (peak_3mo / avg) if avg else None
    return round(peak_3mo, 1), (round(ratio, 2) if ratio else None), peak_month


def intent_verdict(cfg: Config, kw: str, intent_item: Optional[dict]) -> tuple[bool, str, list[str]]:
    """Deterministic intent gate (HARD RULE 4). Returns (keep, primary_label, secondary_labels)."""
    low = kw.lower()
    # token exclude/negative + brand
    for tok in (*cfg.negative_tokens, *cfg.brand_negative_tokens):
        if tok.strip() and tok.lower() in low:
            return False, "negative_token", []
    if cfg.include_tokens and not any(t.lower() in low for t in cfg.include_tokens):
        return False, "missing_include_token", []

    if not intent_item:
        return False, "no_intent_data", []
    ki = intent_item.get("keyword_intent") or {}
    primary = (ki.get("label") or "").lower()
    secondaries = [
        (s.get("label") or "").lower()
        for s in (intent_item.get("secondary_keyword_intents") or [])
    ]
    if primary in cfg.keep_intents:
        return True, primary, secondaries
    # Calculator-token carve-out (see CONFIG.calc_token_intent_override): the live
    # DataForSEO classifier labels calc heads 'informational'. Keep them when tool
    # intent is explicit, so the gate doesn't silently kill the heads.
    if cfg.calc_token_intent_override:
        has_tool_token = any(t.lower() in low for t in cfg.tool_intent_tokens)
        has_commercial_secondary = any(s in cfg.keep_intents for s in secondaries)
        if has_tool_token or has_commercial_secondary:
            tag = "info+tooltoken" if has_tool_token else "info+commercial-secondary"
            return True, tag, secondaries
    # pure informational/navigational with no tool intent -> drop
    return False, primary or "unknown", secondaries


def demand_route(cfg: Config, d: dict) -> tuple[str, bool]:
    """HARD RULE 2 two-floor router. Returns (stage, seasonality_rescued).
    avg selects; peak only rescues + schedules.
    """
    avg = d.get("search_volume") or 0
    if avg >= cfg.adjudicate_min_avg_vol:
        return Stage.DEMAND_CANDIDATE, False
    # seasonality rescue: high ratio AND peak itself clears the seasonal floor
    ratio = d.get("seasonality_ratio") or 0
    peak = d.get("peak_3mo_avg") or 0
    if ratio >= cfg.seasonality_rescue_ratio and peak >= cfg.seasonality_peak_min_vol:
        return Stage.DEMAND_CANDIDATE, True
    # below floor and not rescued => harvest content input only (never its own URL)
    return Stage.HARVEST, False


def pld_of(host: str) -> Optional[str]:
    """Pay-level domain via PSL (handles m./blog./co.uk so overlap isn't a false negative)."""
    if not host:
        return None
    host = host.strip().lower()
    if host.startswith("www."):
        host = host[4:]
    if _TLDX is None:
        # Degraded fallback: last two labels. Wrong on co.uk etc. — install tldextract.
        parts = host.split(".")
        return ".".join(parts[-2:]) if len(parts) >= 2 else host
    ext = _TLDX(host)
    if not ext.domain or not ext.suffix:
        return host
    return f"{ext.domain}.{ext.suffix}"


def serp_top_plds(cfg: Config, serp_result: dict) -> tuple[list[str], list[str]]:
    """Return (top_n cleaned PLDs for clustering, distinct item_types).
    Aggregators are stripped per HARD RULE 6 BEFORE any overlap math.
    """
    items = serp_result.get("items") or []
    item_types = sorted({it.get("type") for it in items if it.get("type")})
    organic = [it for it in items if it.get("type") == "organic"]
    plds: list[str] = []
    for it in organic:
        host = it.get("domain") or _host_from_url(it.get("url"))
        pld = pld_of(host)
        if not pld or pld in cfg.aggregator_stopword_domains:
            continue
        if pld not in plds:
            plds.append(pld)
        if len(plds) >= cfg.serp_top_n_urls:
            break
    return plds, item_types


def compact_serp_slice(cfg: Config, keyword: str, serp_result: dict, kd: Optional[int]) -> dict:
    """The compact slice handed to Claude per keyword (HARD RULE 5).
    item_types[], ai_overview{text,references}, top-10 organic{rank,pld,title,snippet},
    widget bools, featured_snippet.text, keyword_difficulty.
    """
    items = serp_result.get("items") or []
    item_types = sorted({it.get("type") for it in items if it.get("type")})
    organic = [it for it in items if it.get("type") == "organic"][:10]
    top10 = [{
        "rank_absolute": it.get("rank_absolute"),
        "pld": pld_of(it.get("domain") or _host_from_url(it.get("url"))),
        "title": it.get("title"),
        "snippet": it.get("description") or it.get("snippet"),
    } for it in organic]

    aio = next((it for it in items if it.get("type") == "ai_overview"), None)
    aio_slice = None
    if aio:
        # Live-confirmed shape (2026-06-05): top-level `markdown` is the canonical full
        # AIO text; `items[]` are ai_overview_element blocks (text/markdown); top-level
        # `references[]` carry {source,domain,url,title,text}. asynchronous_ai_overview:true
        # confirms load_async_ai_overview took effect.
        aio_slice = {
            "text": aio.get("markdown") or aio.get("text") or _aio_text(aio),
            "references": [_strip_www(r.get("domain") or r.get("url"))
                           for r in (aio.get("references") or [])][:10],
        }
    fs = next((it for it in items if it.get("type") == "featured_snippet"), None)
    widget_bools = {t: any(it.get("type") == t for it in items) for t in (
        *cfg.kill_switch_item_types, "people_also_ask", "discussions_and_forums",
        "shopping", "popular_products", "local_pack", "video",
    )}
    return {
        "keyword": keyword,
        "item_types": item_types,
        "ai_overview": aio_slice,           # None if absent (load_async_ai_overview must be on)
        "featured_snippet": (fs.get("text") if fs else None),
        "widgets": widget_bools,
        "organic_top10": top10,
        "keyword_difficulty": kd,           # Axis-B evidence only — NOT a gate
    }


def _aio_text(aio: dict) -> Optional[str]:
    # AIO async payload nests text inside items[] (ai_overview_element). Prefer text,
    # fall back to markdown. (Top-level `markdown` is tried first by the caller.)
    parts = []
    for blk in aio.get("items") or []:
        t = blk.get("text") or blk.get("markdown")
        if t:
            parts.append(t)
    return " ".join(parts) or None


def _strip_www(host: Optional[str]) -> Optional[str]:
    if not host:
        return host
    h = host.strip().lower()
    return h[4:] if h.startswith("www.") else h


def _host_from_url(url: Optional[str]) -> str:
    if not url:
        return ""
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc
    except Exception:
        return ""


def _int(x) -> Optional[int]:
    try:
        return int(x) if x is not None else None
    except (TypeError, ValueError):
        return None


def _float(x) -> Optional[float]:
    try:
        return float(x) if x is not None else None
    except (TypeError, ValueError):
        return None


# =============================================================================
# 6 (clustering): aggregator-stripped, IDF-weighted overlap + union-find
# =============================================================================

class UnionFind:
    def __init__(self, items: list[str]):
        self.parent = {x: x for x in items}

    def find(self, x: str) -> str:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def cluster_keywords(cfg: Config, kw_to_plds: dict[str, list[str]],
                     mode: str = "idf") -> dict[str, int]:
    """Union-find over the cleaned, weighted PLD-overlap graph. Returns kw -> cluster_id."""
    kws = list(kw_to_plds)
    if not kws:
        return {}
    n = len(kws)
    # document frequency of each PLD across keyword SERPs
    df: dict[str, int] = {}
    for plds in kw_to_plds.values():
        for p in set(plds):
            df[p] = df.get(p, 0) + 1
    idf = {p: math.log((n + 1) / (c + 0.5)) for p, c in df.items()}

    uf = UnionFind(kws)
    for i in range(n):
        a = kws[i]
        sa = set(kw_to_plds[a])
        for j in range(i + 1, n):
            b = kws[j]
            shared = sa & set(kw_to_plds[b])
            if not shared:
                continue
            if mode == "raw":
                if len(shared) >= cfg.serp_overlap_min:
                    uf.union(a, b)
            else:  # IDF-weighted (default)
                weight = sum(idf.get(p, 0.0) for p in shared)
                if weight >= cfg.idf_overlap_min:
                    uf.union(a, b)

    # assign stable integer ids
    roots: dict[str, int] = {}
    out: dict[str, int] = {}
    nxt = 1
    for kw in kws:
        r = uf.find(kw)
        if r not in roots:
            roots[r] = nxt
            nxt += 1
        out[kw] = roots[r]
    # sanity warning for residual contamination
    sizes: dict[int, int] = {}
    for cid in out.values():
        sizes[cid] = sizes.get(cid, 0) + 1
    for cid, sz in sizes.items():
        if sz > cfg.cluster_sanity_max_size:
            _warn(f"cluster {cid} has {sz} keywords (> {cfg.cluster_sanity_max_size}). "
                  f"Either a DENSE single-niche silo (expected when seeding one root -- it's one "
                  f"big hub-and-spoke; fine to keep) OR cross-niche contamination (if you seeded "
                  f"broadly). To SUB-SEGMENT into intent sub-silos, raise idf_overlap_min "
                  f"(LIVE: concrete split into yards/bags/cost sub-silos at ~6.0 vs one blob at "
                  f"1.6); to de-contaminate, expand AGGREGATOR_STOPWORD_DOMAINS.")
    return out


def _diverse_order(cfg: Config, cand_rows: list[sqlite3.Row]) -> list[str]:
    """Order candidates so each distinct token signature (computation) appears once before
    any signature repeats. Within the first pass, signatures are visited by their max volume;
    remaining variants then follow by volume. Guarantees psi/cure/ratio/cost each get a SERP
    read even though they are lower-volume than the volume variants."""
    by_sig: dict[frozenset, list[tuple[int, str]]] = {}
    for r in cand_rows:
        sig = keyword_signature(cfg, r["seed_root"] or "", r["keyword"])
        by_sig.setdefault(sig, []).append((r["search_volume"] or 0, r["keyword"]))
    for sig in by_sig:
        by_sig[sig].sort(reverse=True)  # highest volume first within a signature
    # signatures ordered by their top volume (demand still routes which computation first)
    sigs_ranked = sorted(by_sig, key=lambda s: by_sig[s][0][0], reverse=True)
    ordered: list[str] = []
    # round-robin: one rep per signature per round, so first len(sigs) picks are all-distinct
    round_idx = 0
    while True:
        added = False
        for sig in sigs_ranked:
            if round_idx < len(by_sig[sig]):
                ordered.append(by_sig[sig][round_idx][1])
                added = True
        if not added:
            break
        round_idx += 1
    return ordered


def deconfliction_flags(cfg: Config, cluster_plds: dict[int, set[str]]) -> set[int]:
    """Flag clusters whose cleaned domain sets overlap > CROSS_CLUSTER_OVERLAP_MAX (cannibalization)."""
    flagged: set[int] = set()
    cids = list(cluster_plds)
    for i in range(len(cids)):
        for j in range(i + 1, len(cids)):
            a, b = cluster_plds[cids[i]], cluster_plds[cids[j]]
            if not a or not b:
                continue
            jacc = len(a & b) / len(a | b)
            if jacc > cfg.cross_cluster_overlap_max:
                flagged.add(cids[i])
                flagged.add(cids[j])
    return flagged


# =============================================================================
# 5 (Claude adjudication interface): compact-slice in -> verdict-schema out
#    with cluster-level inheritance. This is the ONLY place Claude touches data.
# =============================================================================

VERDICT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "keyword": {"type": "string"},
        "kill_switch": {"type": ["string", "null"],
                        "description": "name of the inline-compute widget that killed it, or null"},
        "tool_saturation": {"type": "string",
                            "description": "e.g. 'gap(1/10)','contested(4/10)','saturated(7/10)'"},
        "authority_floor": {"type": "string", "enum": ["low", "medium", "high"]},
        "aio": {"type": "string",
                "enum": ["absent", "present-explains-only", "present-computes"]},
        "serp_difficulty": {"type": "string",
                            "enum": ["easy", "keep-prime", "medium", "hard"]},
        "beatable_by_better_tool": {"type": "boolean"},
        "verdict": {"type": "string", "enum": ["keep-prime", "keep", "defer", "drop"]},
        "reason": {"type": "string",
                   "description": "provenance: reconstruct item_types, tool count, domains, AIO behavior"},
    },
    "required": ["keyword", "kill_switch", "tool_saturation", "authority_floor", "aio",
                 "serp_difficulty", "beatable_by_better_tool", "verdict", "reason"],
}

RUBRIC_SYSTEM = """You are a Principal pSEO difficulty adjudicator. You are handed a COMPACT SLICE of a
real Google mobile SERP for one CALCULATOR keyword. Decide how hard it is for a brand-new DR~0 site to
rank an interactive calculator there. Difficulty = (kill switches) -> (saturation x authority) -> matrix cell.
KD is evidence INSIDE Axis B only, NEVER the gate.

STEP 1 - HARD KILL SWITCHES (any present => verdict 'drop', kill_switch set, stop):
 - A math_solver / currency_box / google_finance widget is present (Google computes inline -> dead).
 - ai_overview is present AND it COMPUTES a specific answer. Read ai_overview.text: a worked number/result
   = computes => drop (aio='present-computes'). A method/how-to explanation that does NOT produce the answer
   = NOT a kill (aio='present-explains-only'). If no ai_overview => aio='absent'.

STEP 2 - SCORE TOP 10 ON TWO AXES:
 - Axis A Tool saturation: count ACTUAL working calculators matching intent (a real interactive tool, not an
   article ABOUT calculating). 0-2 = gap ; 3-5 = contested ; 6+ = saturated. Report as 'gap(N/10)' etc.
 - Axis B Authority floor: count high-DR brands / .gov / .edu / Wikipedia, corroborated by keyword_difficulty.
   mostly-weak (forums/Reddit/thin/outdated/PDF/listicle) = low ; mixed = medium ; mostly-brands = high.

STEP 3 - VERDICT MATRIX:
   gap(0-2) + low                       => 'easy'      , verdict 'keep-prime'
   gap(0-2) + high  (THE SWEET SPOT)    => 'medium'    , verdict 'keep'
   contested(3-5) + low/mixed           => 'medium'    , verdict 'keep'
   contested(3-5) + high                => 'hard'      , verdict 'defer'
   saturated(6+) + any                  => 'hard'      , verdict 'drop'

THESIS: best opportunity = demand + a TOOL GAP under a HIGH authority floor (authoritative sites ranking
ARTICLES about how to calculate X, no clean interactive tool in the top 10). KD reads 'hard' there, which is
exactly why KD is not the gate; you win by MATCHING the transactional intent with a tool.

beatable_by_better_tool = true when a DR~0 site shipping a clean, fast, correct calculator could plausibly
crack the top 10 despite the authority floor. The `reason` MUST let a human replay the decision: name the
tool count, the notable domains, and the AIO behavior you observed. Output ONLY the structured verdict."""


def adjudicate_keyword(client, cfg: Config, slice_obj: dict) -> dict:
    """Single Claude call: compact slice -> validated verdict dict."""
    resp = client.messages.parse(
        model=cfg.claude_model,
        max_tokens=cfg.claude_max_tokens,
        thinking={"type": "adaptive"},          # difficulty is a real judgment
        output_config={"effort": cfg.claude_effort,
                       "format": {"type": "json_schema", "schema": VERDICT_SCHEMA}},
        system=RUBRIC_SYSTEM,
        messages=[{"role": "user",
                   "content": "SERP slice (JSON):\n" + json.dumps(slice_obj, ensure_ascii=False)}],
    )
    out = resp.parsed_output
    if out is None:
        raise RuntimeError(f"Claude returned no parseable verdict for {slice_obj.get('keyword')!r} "
                           f"(stop_reason={resp.stop_reason})")
    return out


def _make_anthropic_client(cfg: Config):
    raise RuntimeError("BANNED: Claude API credit usage is completely prohibited. Use Claude Code session (free) for adjudication instead.")


# =============================================================================
# 3. --validate : one live call per endpoint asserting field paths exist
# =============================================================================

def cmd_validate(cfg: Config) -> int:
    df = DataForSEO(cfg)
    probe_kw = "concrete calculator"
    failures: list[str] = []

    def check(label: str, cond: bool, detail: str = "") -> None:
        mark = "OK " if cond else "FAIL"
        print(f"  [{mark}] {label} {detail}")
        if not cond:
            failures.append(label)

    print("== keyword_ideas/live ==")
    try:
        items = df.keyword_ideas(probe_kw, cfg.related_depth, cfg.seed_server_min_vol)
        check("returns items", bool(items), f"({len(items)} items)")
        if items:
            it = items[0]
            ki = it.get("keyword_info") or {}
            kp = it.get("keyword_properties") or {}
            check("keyword_info.search_volume present", "search_volume" in ki)
            check("keyword_info.monthly_searches[] present", isinstance(ki.get("monthly_searches"), list))
            check("keyword_info.competition is float 0..1",
                  isinstance(ki.get("competition"), (int, float)) or ki.get("competition") is None,
                  f"(={ki.get('competition')})")
            check("keyword_info.cpc present", "cpc" in ki)
            check("keyword_properties.keyword_difficulty present", "keyword_difficulty" in kp,
                  f"(={kp.get('keyword_difficulty')})")
    except Exception as e:  # noqa: BLE001
        check("keyword_ideas call", False, f"-> {e}")

    print("== keyword_suggestions/live ==")
    try:
        sug = df.keyword_suggestions(probe_kw, cfg.seed_server_min_vol)
        check("returns items", bool(sug), f"({len(sug)} items)")
        if sug:
            ki = (sug[0].get("keyword_info") or {})
            check("keyword_info.search_volume present", "search_volume" in ki)
            on = sum(1 for s in sug if "concrete" in (s.get("keyword") or "").lower())
            print(f"       on-entity ('concrete') share: {on}/{len(sug)} "
                  f"(suggestions should be ~all on-entity vs ideas ~1%)")
    except Exception as e:  # noqa: BLE001
        check("keyword_suggestions call", False, f"-> {e}")

    print("== search_intent/live ==")
    try:
        intents = df.search_intent([probe_kw])
        it = intents.get(probe_kw) or next(iter(intents.values()), None)
        check("returns intent item", it is not None)
        if it:
            check("keyword_intent.label present", bool((it.get("keyword_intent") or {}).get("label")),
                  f"(={(it.get('keyword_intent') or {}).get('label')})")
            check("secondary_keyword_intents[] present (may be empty)",
                  "secondary_keyword_intents" in it)
    except Exception as e:  # noqa: BLE001
        check("search_intent call", False, f"-> {e}")

    print("== serp/google/organic/live/advanced ==")
    try:
        res = df.serp(probe_kw)
        items = res.get("items") or []
        types = sorted({i.get("type") for i in items if i.get("type")})
        check("returns items[]", bool(items), f"({len(items)} items)")
        check("organic items have .domain",
              any(i.get("type") == "organic" and i.get("domain") for i in items))
        check("item .type present", all("type" in i for i in items[:5]))
        print(f"       item_types seen: {types}")
        has_aio = any(i.get("type") == "ai_overview" for i in items)
        print(f"       ai_overview present on this probe: {has_aio} "
              f"(load_async_ai_overview={cfg.serp_load_async_ai_overview})")
    except Exception as e:  # noqa: BLE001
        check("serp call", False, f"-> {e}")

    print(f"\nTotal DataForSEO cost this validate run: ${df.total_cost:.4f}")
    if failures:
        print(f"VALIDATION FAILED ({len(failures)} assertions). Fix field paths before any bulk run.")
        return 1
    print("VALIDATION PASSED. Field paths match the live API.")
    return 0


# =============================================================================
# 4. MOCKS  (structurally accurate; must match what --validate returns;
#            labeled illustrative)
# =============================================================================
# ILLUSTRATIVE ONLY. Shapes mirror the asserted field paths so the offline
# pipeline (--mock) exercises the real parser, the IDF clustering path, a VIABLE
# cluster, the adjudication+inheritance path, and deconfliction. Numbers invented.
#
# Two niches so IDF has contrast (a domain in every SERP is uninformative; a domain
# unique to one niche is discriminative):
#   - "concrete calculator": 10 leaves -> clears the size-8 viability gate
#   - "deck calculator":      4 leaves -> correctly fails the gate (niche lacks depth)

def _months(v: int) -> list[dict]:
    return [{"year": 2025, "month": m, "search_volume": v} for m in range(1, 13)]

def _seasonal_months(peak: int, trough: int) -> list[dict]:
    # summer-peaking shape (concrete/outdoor): rescues a low-avg seasonal term
    shape = [trough, trough, int(peak * .6), int(peak * .8), peak, peak,
             peak, int(peak * .8), int(peak * .6), trough, trough, trough]
    return [{"year": 2025, "month": m + 1, "search_volume": shape[m]} for m in range(12)]

def _idea(kw: str, vol: int, kd: int, comp: float, cpc: float, months=None) -> dict:
    return {"keyword": kw,
            "keyword_info": {"search_volume": vol, "competition": comp, "cpc": cpc,
                             "monthly_searches": months or _months(vol)},
            "keyword_properties": {"keyword_difficulty": kd}}

MOCK_KEYWORD_IDEAS: dict[str, list[dict]] = {
    "concrete calculator": [
        _idea("concrete calculator", 90500, 64, 0.12, 1.10,
              months=[{"year": 2025, "month": m + 1, "search_volume": v} for m, v in enumerate(
                  [60500, 60500, 74000, 90500, 110000, 135000, 135000, 110000, 90500, 74000, 60500, 49500])]),
        _idea("concrete slab calculator", 18100, 41, 0.09, 0.90),
        _idea("concrete calculator yards", 8100, 33, 0.07, 0.80),
        _idea("concrete bags calculator", 1900, 18, 0.05, 0.70),
        _idea("concrete steps calculator", 880, 12, 0.04, 0.60),
        _idea("concrete column calculator", 720, 14, 0.04, 0.55),
        _idea("concrete footing calculator", 1300, 22, 0.06, 0.75),
        _idea("concrete driveway calculator", 1600, 27, 0.08, 0.95),
        _idea("concrete wall calculator", 590, 16, 0.03, 0.50),
        _idea("concrete patio calculator", 480, 19, 0.05, 0.65,
              months=_seasonal_months(1300, 90)),   # low avg, summer peak -> seasonality rescue
        _idea("concrete calculator jobs", 320, 5, 0.01, 0.10),   # negative token -> intent drop
    ],
    "deck calculator": [
        _idea("deck calculator", 14800, 52, 0.14, 1.40),
        _idea("deck board calculator", 2900, 30, 0.10, 1.10),
        _idea("deck footing calculator", 880, 21, 0.06, 0.90),
        _idea("deck stain calculator", 720, 18, 0.05, 0.70),
    ],
}

def _intent(kw: str, primary: str, secondary: Optional[list[str]] = None) -> dict:
    return {"keyword": kw, "keyword_intent": {"label": primary},
            "secondary_keyword_intents": [{"label": s} for s in (secondary or [])]}

MOCK_INTENT: dict[str, dict] = {
    "concrete calculator": _intent("concrete calculator", "transactional", ["informational"]),
    "concrete slab calculator": _intent("concrete slab calculator", "transactional"),
    "concrete calculator yards": _intent("concrete calculator yards", "transactional"),
    "concrete bags calculator": _intent("concrete bags calculator", "commercial"),
    "concrete steps calculator": _intent("concrete steps calculator", "transactional"),
    "concrete column calculator": _intent("concrete column calculator", "transactional"),
    "concrete footing calculator": _intent("concrete footing calculator", "transactional"),
    "concrete driveway calculator": _intent("concrete driveway calculator", "transactional"),
    "concrete wall calculator": _intent("concrete wall calculator", "transactional"),
    "concrete patio calculator": _intent("concrete patio calculator", "transactional"),
    "concrete calculator jobs": _intent("concrete calculator jobs", "informational"),
    "deck calculator": _intent("deck calculator", "transactional"),
    "deck board calculator": _intent("deck board calculator", "transactional"),
    "deck footing calculator": _intent("deck footing calculator", "transactional"),
    "deck stain calculator": _intent("deck stain calculator", "commercial"),
}

# Niche-specific indie domains that recur WITHIN a niche (discriminative under IDF)
# plus a shared big-box/brand authority floor that is mostly stripped as aggregators
# (homedepot/lowes) but still visible in the slice for the authority read.
_CONCRETE_INDIE = ["concretenetwork.com", "concretecalculatorpro.io", "slabestimator.com",
                   "mixonsite.com", "yardageguide.com", "quikrete.com"]
_DECK_INDIE = ["decksgo.com", "deckcalc.io", "trex.com", "fortressbp.com"]
_BIGBOX = ["homedepot.com", "lowes.com"]   # stripped as aggregators; count toward authority floor

def _mock_serp(keyword: str) -> dict:
    indie = _DECK_INDIE if keyword.startswith("deck") else _CONCRETE_INDIE
    items: list[dict] = []
    rank = 1
    for d in _BIGBOX:
        items.append({"type": "organic", "rank_absolute": rank, "domain": d,
                      "url": f"https://{d}/guide", "title": "How to estimate (buying guide)",
                      "description": "Big-box how-to article; no interactive tool."})
        rank += 1
    for d in indie:
        items.append({"type": "organic", "rank_absolute": rank, "domain": d,
                      "url": f"https://{d}/guide", "title": "Estimating guide",
                      "description": "Article about how to calculate; no clean tool."})
        rank += 1
    items.append({"type": "people_also_ask", "items": [{"text": "How much do I need?"}]})
    if keyword in ("concrete calculator", "deck calculator"):  # heads: one real tool + AIO-explains
        items.insert(0, {"type": "organic", "rank_absolute": 1, "domain": "calculator.net",
                         "url": "https://calculator.net/x.html", "title": "Free Calculator",
                         "description": "Interactive calculator."})
        items.append({"type": "ai_overview", "references": [{"domain": indie[0]}],
                      "items": [{"text": "To estimate, multiply length by width by depth and convert "
                                         "units; the exact amount depends on your project dimensions."}]})
    return {"items": items}


# =============================================================================
# Pipeline orchestration
# =============================================================================

def run_pipeline(cfg: Config, st: State, seed_roots: list[str], *,
                 mock: bool, overlap_mode: str, limit: Optional[int],
                 skip_adjudication: bool, reseed: bool = False) -> None:
    df = None if mock else DataForSEO(cfg)

    # ---- SEED + INTENT + DEMAND (resume: skip seed+intent re-fetch per root) -
    for root in seed_roots:
        existing = {r["keyword"] for r in st.rows("seed_root=? AND stage!=?", (root, Stage.SEEDED))}
        if existing and not reseed:
            _info(f"resume: root {root!r} already has {len(existing)} processed terms; "
                  f"skipping keyword_ideas + search_intent re-fetch (use --reseed to force).")
            continue
        items = (MOCK_KEYWORD_IDEAS.get(root, []) if mock
                 else df.seed_terms(root, cfg.seed_server_min_vol))
        # store raw demand for every ON-ENTITY seeded term (drop category siblings that
        # keyword_ideas drags in -- they would waste SERP budget and never cluster here).
        kws = []
        skipped_off_entity = 0
        skipped_no_tool = 0
        entity_mode = (cfg.seeder == "entity")
        for it in items:
            kw = it.get("keyword")
            if not kw:
                continue
            if not on_entity(cfg, root, kw):
                skipped_off_entity += 1
                continue
            # Entity-seed: keep only tool-intent terms (turns "all concrete terms" into
            # "concrete calculators"). This is what discovers the DISTINCT computations.
            if entity_mode and cfg.entity_seed_require_tool_token and not has_tool_token(cfg, kw):
                skipped_no_tool += 1
                continue
            d = parse_demand(it)
            st.upsert_seed(kw, root, d)
            kws.append(kw)
        st.commit()
        if skipped_off_entity or skipped_no_tool:
            _info(f"root {root!r}: kept {len(kws)} on-entity tool terms; dropped "
                  f"{skipped_off_entity} off-entity + {skipped_no_tool} non-tool "
                  f"(entity tokens={root_entity_tokens(cfg, root)}).")

        # intent gate (batch)
        intents = (MOCK_INTENT if mock else df.search_intent(kws))
        survivors = 0
        for kw in kws:
            keep, primary, secondaries = intent_verdict(cfg, kw, intents.get(kw))
            if not keep:
                st.update(kw, stage=Stage.INTENT_DROP, intent=primary,
                          intent_secondary=json.dumps(secondaries))
                continue
            # demand routing (two floors + seasonality rescue)
            row = st.rows("keyword=?", (kw,))[0]
            d = {k: row[k] for k in ("search_volume", "peak_3mo_avg", "seasonality_ratio")}
            stage, rescued = demand_route(cfg, d)
            st.update(kw, stage=stage, intent=primary,
                      intent_secondary=json.dumps(secondaries),
                      seasonality_rescued=1 if rescued else 0)
            if stage == Stage.DEMAND_CANDIDATE:
                survivors += 1
        st.commit()
        _info(f"root {root!r}: {survivors} demand candidates "
              f"(>= {cfg.adjudicate_min_avg_vol} avg or seasonally rescued).")
        if survivors < cfg.starved_root_threshold and not mock:
            _warn(f"root {root!r} is STARVED ({survivors} < {cfg.starved_root_threshold}). "
                  f"Consider re-running this root at related_depth={cfg.related_depth_starved}.")

    # ---- SERP fetch + PLD extraction for demand candidates -------------------
    # Candidate ORDER decides what gets a SERP read under --limit. Demand routes attention
    # (HARD RULE 2), but pure top-N-by-volume re-surfaces the same computation's variants
    # and buries the distinct low-volume tools (psi/cure/ratio). "diverse" sampling covers
    # one representative per token SIGNATURE first (so each distinct COMPUTATION gets read),
    # then fills by volume. "volume" = pure top-N (only for deepening one page's variants).
    cand_rows = st.db.execute(
        "SELECT keyword, seed_root, search_volume FROM keywords WHERE stage=? "
        "ORDER BY search_volume DESC", (Stage.DEMAND_CANDIDATE,)).fetchall()
    if cfg.serp_sample == "diverse":
        candidates = _diverse_order(cfg, cand_rows)
    else:
        candidates = [r["keyword"] for r in cand_rows]
    # also re-include already-clustered/adjudicated (resume) so clustering sees the full set
    clustered_already = [r["keyword"] for r in st.rows(
        "stage IN (?,?)", (Stage.CLUSTERED, Stage.ADJUDICATED))]
    work = candidates[:limit] if limit else candidates
    _info(f"{len(candidates)} demand candidates; fetching SERP for {len(work)} "
          f"(already clustered/adjudicated: {len(clustered_already)}).")

    kw_to_plds: dict[str, list[str]] = {}
    for kw in work:
        cached = st.get_serp_slice(kw)
        if cached is not None:  # resume: do not re-fetch
            plds = [o["pld"] for o in cached.get("organic_top10", []) if o.get("pld")
                    and o["pld"] not in cfg.aggregator_stopword_domains]
            kw_to_plds[kw] = plds[:cfg.serp_top_n_urls]
            continue
        res = _mock_serp(kw) if mock else df.serp(kw)
        if cfg.polite_sleep_s and not mock:
            time.sleep(cfg.polite_sleep_s)
        kd_row = st.rows("keyword=?", (kw,))[0]
        plds, item_types = serp_top_plds(cfg, res)
        slice_obj = compact_serp_slice(cfg, kw, res, kd_row["keyword_difficulty"])
        st.set_serp(kw, item_types, slice_obj)
        st.update(kw, plds=json.dumps(plds), stage=Stage.CLUSTERED)
        kw_to_plds[kw] = plds
    # fold in resume rows' persisted PLDs
    for kw in clustered_already:
        if kw in kw_to_plds:
            continue
        row = st.rows("keyword=?", (kw,))[0]
        if row["plds"]:
            kw_to_plds[kw] = json.loads(row["plds"])
    st.commit()

    # ---- CLUSTER -------------------------------------------------------------
    kw_cluster = cluster_keywords(cfg, kw_to_plds, mode=overlap_mode)
    for kw, cid in kw_cluster.items():
        st.update(kw, cluster_id=cid)
    st.commit()

    # ---- CLUSTER VIABILITY + roles ------------------------------------------
    cluster_members: dict[int, list[sqlite3.Row]] = {}
    for kw, cid in kw_cluster.items():
        cluster_members.setdefault(cid, []).append(st.rows("keyword=?", (kw,))[0])

    cluster_plds: dict[int, set[str]] = {
        cid: set().union(*[set(json.loads(m["plds"] or "[]")) for m in members]) if members else set()
        for cid, members in cluster_members.items()
    }
    deconflict = deconfliction_flags(cfg, cluster_plds)

    viable_clusters: dict[int, dict] = {}
    for cid, members in cluster_members.items():
        size = len(members)
        # total volume from the TOP-N terms' robust average (NOT a sum of noise)
        vols = sorted((m["search_volume"] or 0 for m in members), reverse=True)[:cfg.cluster_volume_top_n]
        total_topn = int(sum(vols) / max(1, len(vols)) * len(vols)) if vols else 0
        kds = [m["keyword_difficulty"] for m in members if m["keyword_difficulty"] is not None]
        avg_kd = round(sum(kds) / len(kds), 1) if kds else None
        # pillar = best-available mid-tail term (architectural hub, NOT a winnable head):
        # pick the highest-volume member as the SERP characterizer; hub targets it.
        pillar = max(members, key=lambda m: (m["search_volume"] or 0))
        passes = size >= cfg.min_cluster_size and total_topn >= cfg.min_total_cluster_volume
        viable_clusters[cid] = {
            "cluster_id": cid, "pillar_keyword": pillar["keyword"], "keyword_count": size,
            "total_volume_topn": total_topn, "avg_kd": avg_kd,
            "deconfliction_flag": 1 if cid in deconflict else 0,
            "viable": 1 if passes else 0,
        }
        if not passes and not mock:
            _info(f"cluster {cid} NOT viable (size {size}/{cfg.min_cluster_size}, "
                  f"vol {total_topn}/{cfg.min_total_cluster_volume}). "
                  f"This is correct behavior when the niche lacks depth -- do NOT lower the gate.")

    # ---- ADJUDICATE (cluster-level: pillar + sampled spokes; inherit) --------
    if not skip_adjudication:
        client = _make_anthropic_client(cfg)
    for cid, vc in viable_clusters.items():
        members = cluster_members[cid]
        if not vc["viable"]:
            # still record verdict shell so export is complete
            for m in members:
                st.update(m["keyword"], stage=Stage.ADJUDICATED, verdict="drop",
                          reason="cluster below viability gate (size/volume); not minted.")
            continue
        if skip_adjudication and not mock:
            # Live deterministic pass with no adjudicator key: leave verdicts NULL and
            # stage=CLUSTERED so a later `--run` resumes adjudication from the cached
            # SERP slices without re-fetching. (Mock verdicts are for --mock only.)
            for m in members:
                st.update(m["keyword"], stage=Stage.CLUSTERED)
            continue
        pillar_kw = vc["pillar_keyword"]
        # deep-adjudicate pillar + up to 3 sampled spokes (HARD RULE 7 throughput rule)
        spokes = [m["keyword"] for m in members if m["keyword"] != pillar_kw]
        sampled = [pillar_kw] + spokes[:3]
        verdicts: dict[str, dict] = {}
        for kw in sampled:
            slice_obj = st.get_serp_slice(kw)
            if slice_obj is None:
                continue
            if skip_adjudication:  # offline mock: deterministic stand-in verdict
                verdicts[kw] = _mock_verdict(kw, slice_obj)
            else:
                verdicts[kw] = _adjudicate_with_killswitch(cfg, client, slice_obj)
        pillar_verdict = verdicts.get(pillar_kw) or next(iter(verdicts.values()), None)
        # write sampled verdicts; inherit pillar verdict to unsampled spokes unless a
        # spoke's own SERP visibly diverges (here: same item_types signature => inherit).
        for m in members:
            kw = m["keyword"]
            v = verdicts.get(kw)
            inherited = 0
            if v is None and pillar_verdict is not None:
                v = dict(pillar_verdict)
                v["keyword"] = kw
                v["reason"] = f"[inherited from pillar '{pillar_kw}'] " + v["reason"]
                inherited = 1
            if v is None:
                continue
            st.update(kw, stage=Stage.ADJUDICATED,
                      kill_switch=v.get("kill_switch"),
                      tool_saturation=v.get("tool_saturation"),
                      authority_floor=v.get("authority_floor"),
                      aio=v.get("aio"),
                      serp_difficulty=v.get("serp_difficulty"),
                      beatable_by_tool=1 if v.get("beatable_by_better_tool") else 0,
                      verdict=v.get("verdict"),
                      reason=v.get("reason"),
                      verdict_inherited=inherited)
        # sweet-spot flag: pillar is gap-under-high-authority and kept
        sweet = 1 if (pillar_verdict and pillar_verdict.get("authority_floor") == "high"
                      and pillar_verdict.get("tool_saturation", "").startswith("gap")
                      and pillar_verdict.get("verdict") in ("keep", "keep-prime")) else 0
        vc["sweet_spot_flag"] = sweet
        vc["serp_difficulty"] = pillar_verdict.get("serp_difficulty") if pillar_verdict else None
        st.commit()

    # ---- persist cluster summaries + hub/spoke plan --------------------------
    for cid, vc in viable_clusters.items():
        members = cluster_members[cid]
        # A cluster = one PAGE. Member keywords are that page's targets: the pillar is the
        # PRIMARY target, the rest are VARIANT targets (same URL). Page identity (niche/page
        # slug, hub-vs-spoke) is computed at export across all clusters of the niche.
        for m in members:
            role = "primary" if m["keyword"] == vc["pillar_keyword"] else "variant"
            st.update(m["keyword"], cluster_role=role)
        st.write_cluster({
            "cluster_id": cid,
            "pillar_keyword": vc["pillar_keyword"],
            "keyword_count": vc["keyword_count"],
            "total_volume_topn": vc["total_volume_topn"],
            "avg_kd": vc["avg_kd"],
            "sweet_spot_flag": vc.get("sweet_spot_flag", 0),
            "deconfliction_flag": vc["deconfliction_flag"],
            "serp_difficulty": vc.get("serp_difficulty"),
            "hub_url": None,           # computed at export (cluster=page)
            "spoke_count": None,
            "viable": vc["viable"],
        })
    st.commit()
    if not mock and df is not None:
        _info(f"Total DataForSEO cost this run: ${df.total_cost:.4f}")


def _adjudicate_with_killswitch(cfg: Config, client, slice_obj: dict) -> dict:
    """Deterministic widget kill-switch BEFORE spending a Claude call where possible;
    Claude still reads the AIO-computes question (it needs to read the text)."""
    widgets = slice_obj.get("widgets") or {}
    for t in cfg.kill_switch_item_types:
        if widgets.get(t):
            return {
                "keyword": slice_obj.get("keyword"),
                "kill_switch": t,
                "tool_saturation": "n/a",
                "authority_floor": "n/a",
                "aio": "absent" if not slice_obj.get("ai_overview") else "present-explains-only",
                "serp_difficulty": "hard",
                "beatable_by_better_tool": False,
                "verdict": "drop",
                "reason": f"hard kill: '{t}' widget computes the answer inline; "
                          f"item_types={slice_obj.get('item_types')}.",
            }
    return adjudicate_keyword(client, cfg, slice_obj)


def _mock_verdict(kw: str, slice_obj: dict) -> dict:
    """Offline stand-in for Claude (used by --mock / --skip-adjudication).
    Crude deterministic mirror of the rubric so the pipeline runs end-to-end."""
    widgets = slice_obj.get("widgets") or {}
    for t in ("math_solver", "currency_box", "google_finance"):
        if widgets.get(t):
            return {"keyword": kw, "kill_switch": t, "tool_saturation": "n/a",
                    "authority_floor": "n/a", "aio": "absent", "serp_difficulty": "hard",
                    "beatable_by_better_tool": False, "verdict": "drop",
                    "reason": f"[MOCK] kill switch {t}."}
    top = slice_obj.get("organic_top10", [])
    tools = sum(1 for o in top if "calculator" in (o.get("title") or "").lower())
    brandy = sum(1 for o in top if (o.get("pld") or "") in
                 ("lowes.com", "homedepot.com", "quikrete.com", "familyhandyman.com"))
    sat = "gap" if tools <= 2 else ("contested" if tools <= 5 else "saturated")
    auth = "high" if brandy >= 3 else ("medium" if brandy >= 1 else "low")
    aio = slice_obj.get("ai_overview")
    aio_state = "absent" if not aio else "present-explains-only"
    if sat == "saturated":
        diff, verdict = "hard", "drop"
    elif sat == "gap" and auth == "high":
        diff, verdict = "medium", "keep"
    elif sat == "gap":
        diff, verdict = "easy", "keep-prime"
    elif auth == "high":
        diff, verdict = "hard", "defer"
    else:
        diff, verdict = "medium", "keep"
    return {"keyword": kw, "kill_switch": None, "tool_saturation": f"{sat}({tools}/10)",
            "authority_floor": auth, "aio": aio_state, "serp_difficulty": diff,
            "beatable_by_better_tool": verdict in ("keep", "keep-prime"), "verdict": verdict,
            "reason": f"[MOCK] {tools} tools / {brandy} brand domains in top10; AIO {aio_state}."}


# =============================================================================
# 6. EXPORT  (SQLite + CSV: per-keyword + cluster summary)
# =============================================================================

PAGE_CSV_COLS = [
    "cluster_id", "niche", "page_role", "page_url", "distinct_intent", "primary_keyword",
    "keyword_count", "page_volume_topn", "avg_kd", "verdict", "serp_difficulty",
    "tool_saturation", "authority_floor", "aio", "sweet_spot_flag", "deconfliction_flag",
    "viable", "keyword_targets", "internal_links", "reason",
]
TARGET_CSV_COLS = [
    "keyword", "cluster_id", "page_url", "page_role", "target_role", "signature",
    "search_volume", "seasonality_ratio", "keyword_difficulty", "competition_float",
    "cpc", "intent", "seed_root",
]


def _niche_slug(cfg: Config, seed_root: str) -> str:
    ent = "-".join(root_entity_tokens(cfg, seed_root))
    return _slug(f"{ent}-calculator")


def _page_slug(cfg: Config, seed_root: str, pillar: str) -> str:
    sig = sorted(keyword_signature(cfg, seed_root, pillar))
    return _slug("-".join(sig)) if sig else "main"


def cmd_export(cfg: Config, st: State) -> None:
    Path(cfg.csv_pages_path).parent.mkdir(parents=True, exist_ok=True)
    clusters = {c["cluster_id"]: c for c in st.clusters()}
    members_by_cluster: dict[int, list[sqlite3.Row]] = {}
    for r in st.rows("cluster_id IS NOT NULL"):
        members_by_cluster.setdefault(r["cluster_id"], []).append(r)

    # ---- build page identity per cluster, grouped by niche (seed_root entity) ----
    pages: dict[int, dict] = {}
    for cid, members in members_by_cluster.items():
        c = clusters.get(cid)
        if not c:
            continue
        seed_root = members[0]["seed_root"] or ""
        pillar = c["pillar_keyword"]
        primary_row = next((m for m in members if m["keyword"] == pillar), members[0])
        pages[cid] = {
            "cluster_id": cid,
            "niche": _niche_slug(cfg, seed_root),
            "seed_root": seed_root,
            "primary_keyword": pillar,
            "page_slug": _page_slug(cfg, seed_root, pillar),
            "members": members,
            "page_volume_topn": c["total_volume_topn"],
            "avg_kd": c["avg_kd"],
            "sweet_spot_flag": c["sweet_spot_flag"],
            "deconfliction_flag": c["deconfliction_flag"],
            "viable": c["viable"],
            "verdict": primary_row["verdict"] or "pending",
            "serp_difficulty": primary_row["serp_difficulty"],
            "tool_saturation": primary_row["tool_saturation"],
            "authority_floor": primary_row["authority_floor"],
            "aio": primary_row["aio"],
            "reason": primary_row["reason"],
        }

    # ---- per niche: the empty-signature (generic head) cluster = HUB, rest = spokes ----
    by_niche: dict[str, list[int]] = {}
    for cid, p in pages.items():
        by_niche.setdefault(p["niche"], []).append(cid)
    for niche, cids in by_niche.items():
        # hub = the page whose primary has an empty signature (bare "<entity> calculator");
        # else the highest-volume page. One hub per niche.
        empty_sig = [cid for cid in cids if pages[cid]["page_slug"] == "main"]
        if empty_sig:
            hub_cid = max(empty_sig, key=lambda c: pages[c]["page_volume_topn"] or 0)
        else:
            hub_cid = max(cids, key=lambda c: pages[c]["page_volume_topn"] or 0)
        for cid in cids:
            p = pages[cid]
            if cid == hub_cid:
                p["page_role"] = "hub"
                p["page_url"] = f"/{niche}/"
            else:
                p["page_role"] = "spoke"
                p["page_url"] = f"/{niche}/{p['page_slug']}/"
        # internal links: hub <-> all spokes; spoke -> up:hub + sibling spokes
        spoke_urls = [pages[c]["page_url"] for c in cids if c != hub_cid]
        for cid in cids:
            p = pages[cid]
            if p["page_role"] == "hub":
                p["internal_links"] = "hub->spokes: " + "; ".join(spoke_urls)
            else:
                sibs = [u for u in spoke_urls if u != p["page_url"]][:6]
                p["internal_links"] = f"up:/{niche}/ | peers: " + "; ".join(sibs)

    # ---- pages.csv (one row per buildable page) ----
    with open(cfg.csv_pages_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=PAGE_CSV_COLS)
        w.writeheader()
        for cid, p in sorted(pages.items(), key=lambda kv: -(kv[1]["page_volume_topn"] or 0)):
            tgts = sorted(p["members"], key=lambda m: -(m["search_volume"] or 0))
            w.writerow({
                "cluster_id": cid, "niche": p["niche"], "page_role": p["page_role"],
                "page_url": p["page_url"], "distinct_intent": p["page_slug"],
                "primary_keyword": p["primary_keyword"], "keyword_count": len(p["members"]),
                "page_volume_topn": p["page_volume_topn"], "avg_kd": p["avg_kd"],
                "verdict": p["verdict"], "serp_difficulty": p["serp_difficulty"],
                "tool_saturation": p["tool_saturation"], "authority_floor": p["authority_floor"],
                "aio": p["aio"], "sweet_spot_flag": p["sweet_spot_flag"],
                "deconfliction_flag": p["deconfliction_flag"], "viable": p["viable"],
                "keyword_targets": "; ".join(m["keyword"] for m in tgts[:15]),
                "internal_links": p["internal_links"], "reason": p["reason"],
            })

    # ---- targets.csv (one row per keyword -> its page URL; variants share the URL) ----
    with open(cfg.csv_targets_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=TARGET_CSV_COLS)
        w.writeheader()
        for cid, p in pages.items():
            for m in sorted(p["members"], key=lambda m: -(m["search_volume"] or 0)):
                sig = sorted(keyword_signature(cfg, p["seed_root"], m["keyword"]))
                w.writerow({
                    "keyword": m["keyword"], "cluster_id": cid, "page_url": p["page_url"],
                    "page_role": p["page_role"], "target_role": m["cluster_role"] or "variant",
                    "signature": " ".join(sig), "search_volume": m["search_volume"],
                    "seasonality_ratio": m["seasonality_ratio"],
                    "keyword_difficulty": m["keyword_difficulty"],
                    "competition_float": m["competition_float"], "cpc": m["cpc"],
                    "intent": m["intent"], "seed_root": m["seed_root"],
                })
                st.update(m["keyword"], stage=Stage.EXPORTED)
    st.commit()
    n_pages = len(pages)
    n_viable = sum(1 for p in pages.values() if p["viable"])
    _info(f"exported {n_pages} candidate pages ({n_viable} viable) -> {cfg.csv_pages_path}; "
          f"keyword targets -> {cfg.csv_targets_path}")


def _slug(s: Optional[str]) -> str:
    if not s:
        return "x"
    out = "".join(ch if ch.isalnum() else "-" for ch in s.lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


# =============================================================================
# logging helpers
# =============================================================================
def _info(msg: str) -> None:
    print(f"[info] {msg}", file=sys.stderr)

def _warn(msg: str) -> None:
    print(f"[WARN] {msg}", file=sys.stderr)


# =============================================================================
# CLI
# =============================================================================

def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--validate", action="store_true",
                    help="One live call per endpoint; assert field paths exist. Run before any bulk run.")
    ap.add_argument("--mock", action="store_true",
                    help="Offline end-to-end on bundled fixtures (no API keys needed).")
    ap.add_argument("--run", action="store_true", help="Run/resume the live pipeline.")
    ap.add_argument("--export", action="store_true", help="(Re)emit CSVs from current SQLite state.")
    ap.add_argument("--seed-roots", type=str, default=None,
                    help="Comma-separated seed roots (overrides CONFIG default).")
    ap.add_argument("--seeder", choices=["suggestions", "ideas"], default=None,
                    help="Seeding endpoint: suggestions (contains-phrase, builds a silo; default) "
                         "or ideas (broad category, discovers adjacent niches).")
    ap.add_argument("--overlap-mode", choices=["idf", "raw"], default="idf",
                    help="Clustering overlap: idf-weighted (default) or raw-count fallback.")
    ap.add_argument("--idf-min", type=float, default=None,
                    help="Override idf_overlap_min. Higher = tighter = more sub-clusters. "
                         "Re-running on an existing DB re-clusters cached SERPs for $0.")
    ap.add_argument("--limit", type=int, default=None,
                    help="Cap SERP fetches this run (throughput throttle; resumable).")
    ap.add_argument("--skip-adjudication", action="store_true",
                    help="Skip the live Claude stage; use the deterministic mock verdict (offline).")
    ap.add_argument("--reseed", action="store_true",
                    help="Force re-fetch of keyword_ideas + search_intent for already-processed roots.")
    ap.add_argument("--db", type=str, default=None, help="Override SQLite path.")
    args = ap.parse_args(argv)

    overrides: dict[str, Any] = {}
    if args.db:
        overrides["db_path"] = args.db
    if args.seeder:
        overrides["seeder"] = args.seeder
    if args.idf_min is not None:
        overrides["idf_overlap_min"] = args.idf_min
    cfg = Config(**{**asdict(CFG), **overrides}) if overrides else CFG

    if args.validate:
        return cmd_validate(cfg)

    seed_roots = ([s.strip() for s in args.seed_roots.split(",") if s.strip()]
                  if args.seed_roots else list(cfg.seed_roots))

    st = State(cfg.db_path)

    if args.mock:
        run_pipeline(cfg, st, ["concrete calculator", "deck calculator"], mock=True,
                     overlap_mode=args.overlap_mode, limit=args.limit, skip_adjudication=True)
        cmd_export(cfg, st)
        _print_mock_summary(cfg, st)
        return 0

    if args.run:
        run_pipeline(cfg, st, seed_roots, mock=False, overlap_mode=args.overlap_mode,
                     limit=args.limit, skip_adjudication=args.skip_adjudication, reseed=args.reseed)
        cmd_export(cfg, st)
        return 0

    if args.export:
        cmd_export(cfg, st)
        return 0

    ap.print_help()
    return 0


def _print_mock_summary(cfg: Config, st: State) -> None:
    print("\n=== MOCK SUMMARY (illustrative) -- a CLUSTER = one PAGE ===")
    members_by_cluster: dict[int, list[sqlite3.Row]] = {}
    for r in st.rows("cluster_id IS NOT NULL"):
        members_by_cluster.setdefault(r["cluster_id"], []).append(r)
    for c in st.clusters():
        members = members_by_cluster.get(c["cluster_id"], [])
        seed_root = members[0]["seed_root"] if members else ""
        page = "HUB /{}/".format(_niche_slug(cfg, seed_root)) if c["viable"] else "(not viable)"
        tgts = sorted((m["keyword"] for m in members),
                      key=lambda k: 0)  # listing only
        print(f"page c{c['cluster_id']} [{page}] primary={c['pillar_keyword']!r} "
              f"targets={c['keyword_count']} vol={c['total_volume_topn']} "
              f"viable={c['viable']}")
        print(f"     keyword targets (one page): {', '.join(list(tgts)[:8])}"
              f"{' ...' if len(members) > 8 else ''}")
    dropped = st.rows("stage=?", (Stage.INTENT_DROP,))
    harvest = st.rows("stage=?", (Stage.HARVEST,))
    print(f"\nintent-dropped: {len(dropped)} | harvest-only (content inputs, no URL): {len(harvest)}")
    print("NOTE: each cluster = ONE URL; its keyword targets share that URL (no variant doorways).")


if __name__ == "__main__":
    raise SystemExit(main())
