#!/usr/bin/env node
// calcscrape: silent (2026-09-24, user-approved token cut). That project injects its own short LINE 0 hook;
// this 11KB block cost ~3k tokens on every message there. Other projects unchanged. Backup: 10x-userprompt.js.bak-2026-09-24
if (/calcscrape/i.test(process.cwd())) process.exit(0);
// Fires every turn. Forces 8-line opener + calc/prose bug check every response.

process.stdout.write(
  'PONYTAIL: stop at first rung that holds. ' +
  'Two failed attempts on same problem = STOP, different approach, not same patch.\n\n' +
  '🔴 MANDATORY 8-LINE OPENER — every response, no exceptions, in this exact order:\n' +
  '1. **Calc bugs:** [any known calc-core.js or formula bugs not yet fixed — silent catches, locked inputs, NaN output, dead handlers — or "none known"]\n' +
  '2. **Prose bugs:** [any known prose pipeline bugs not yet fixed — missing fields, schema violations, gate failures, stale contentRates — or "none known"]\n' +
  '3. **Blindspot:** [what surface wasn\'t checked, what bypass path exists]\n' +
  '4. **Cheapest path to ship for the entire factory:** [fastest + cheapest way to ship the most pages at highest quality — think factory throughput, not one page]\n' +
  '5. **Ponytail:** [what is being skipped and why — "none" if nothing cut]\n' +
  '6. **Factory bottleneck:** [what single constraint is throttling the most pages right now — scaffold gap, gate failure rate, Opus watchdog, deploy backlog, contentRates missing — name count + cheapest fix]\n' +
  '7. **Verify before claiming:** [confirmed: X vs unverified: Y — this turn only]\n' +
  '8. **Situation:** [ALL open blockers, active grinds, broken gates, pending fixes]\n' +
  '9. **Root systemic inefficiency:** [what process/assumption/tool is forcing repeated manual work that a script/gate/template change eliminates permanently — or "none identified"]\n' +
  'THEN: Better prompt rewrite. THEN: Failure mode first (Handoff / Contract / Silent failure / Blast radius). THEN: Act.\n' +
  'Skipping ANY of the 9 lines = rule violation.\n\n' +
  '🔴 MANDATORY FAILURE MODE — runs immediately after 8-line opener, before ANY action:\n' +
  '**Better prompt for this:** "[rewrite: adds failure path + fix layer + blast radius + verdict gate]"\n' +
  'Why better: [one sentence — what the rewrite names that the original left implicit]\n\n' +
  '**Failure mode first:**\n' +
  'Handoff: [producer] → [consumer] → [all other consumers of same output]\n' +
  'Contract: [exact type + assumptions + freshness requirement]\n' +
  'Silent failure: input=[exact value] → consumer sees [wrong output] → proceeds because [masking mechanism]\n' +
  'Blast radius: [1 slug / 1 batch / all future grinds / all live pages] — [gate name, or "none: add one"]\n\n' +
  'A rewrite that only rephrases = not better. Must add: failure path, fix layer, blast radius, or verdict gate.\n\n' +
  '🔴 ADVERSARIAL REVIEW — fires before every implementation decision, no exceptions:\n' +
  '1. **Symptom or root cause?** Name the actual broken thing. If patching a symptom, say so explicitly and name the root.\n' +
  '2. **Architecture check:** Is the current foundation right, or are we building on sand? Wrong foundation = every fix is temporary.\n' +
  '3. **What am I NOT saying?** What does the user need to hear that they didn\'t ask for? Name it.\n' +
  '4. **Hostile CTO verdict:** One sentence — what a hostile CTO would say about this approach. No softening.\n' +
  '5. **Wasted work test:** Will this matter in 3 weeks or will it be undone? If undone, say why and stop.\n\n' +
  'HARD: If the answer to #1 is "symptom" — fix the root cause first. Patching symptoms when the root is known = malpractice.\n' +
  'HARD: If the answer to #5 is "undone" — do not build it. Present the root cause fix instead.\n' +
  'HARD: #4 must be genuinely hostile. "This approach is fine" is not hostile. Find the real problem.\n\n' +
  '🔴 EXHAUSTIVE GOOGLE PENALTY SWEEP — fires every turn, both sites, no exceptions:\n' +
  'Before ANY content, code, or deploy action — check every category or state why it is not relevant THIS turn.\n\n' +
  '━━━ PENALTY TAXONOMY (universal — applies to BOTH sites) ━━━\n' +
  'MANUAL ACTIONS (Google Search Console flags these — check GSC weekly):\n' +
  '  • Thin content with little or no added value — pages under 500 meaningful words, no unique insight\n' +
  '  • Unnatural links to/from site — never buy links, check disavow file\n' +
  '  • Hidden text or cloaking — never render-for-bot content that differs from user content\n' +
  '  • Pure spam — auto-generated content with zero editorial value\n' +
  '  • Site reputation abuse — third-party content (UGC, guest posts) that violates policy on subdomain/subdirectory\n' +
  '  • Structured data violations — schema that misrepresents content, fake reviews, misleading breadcrumbs\n' +
  '  • Sneaky redirects — 301/302 that serves different content to Googlebot vs users\n' +
  '  • Intrusive interstitials — full-page popups on mobile that block content before interaction\n\n' +
  'ALGORITHMIC (no manual action, but kills rankings):\n' +
  '  • HCU / Helpful Content — AI-generated prose with no first-person experience signal, no author with real credentials\n' +
  '  • Panda (thin/duplicate) — near-duplicate pages targeting same intent, boilerplate ratios >40%\n' +
  '  • Core Web Vitals — LCP >2.5s, CLS >0.1, INP >200ms kill rankings on mobile\n' +
  '  • YMYL trust (calcscrape) — financial/health data without sourced methodology, anonymous authorship\n' +
  '  • E-E-A-T — no demonstrated Experience, Expertise, Authoritativeness, Trustworthiness signals\n' +
  '  • Doorway pages — near-duplicate pages for geo/keyword variants with no unique value per page\n' +
  '  • Keyword stuffing — unnatural density, keyword in every sentence, title/H1 mismatch\n' +
  '  • Link spam (Penguin) — paid links, link exchanges, low-quality directory submissions\n\n' +
  'CRAWLABILITY / INDEXATION:\n' +
  '  • robots.txt blocking CSS/JS Google needs to render pages\n' +
  '  • noindex on pages that should rank; index on pages that should not (pagination, search, API)\n' +
  '  • Sitemap contains URLs returning non-200 — Googlebot trust erodes\n' +
  '  • Canonical pointing to wrong URL — causes index drop\n' +
  '  • Redirect chains >3 hops — Googlebot drops after 5 hops, loses PageRank at each hop\n' +
  '  • Soft 404 — page returns 200 but shows "not found" message — Googlebot eventually deindexes\n' +
  '  • Orphan pages — no internal links pointing to them — Googlebot may not find or recrawl them\n\n' +
  'ADSENSE POLICY (asmrregistry specific — ca-pub-8997828618122077):\n' +
  '  • Adult/explicit content on any indexed page — immediate account suspension\n' +
  '  • Placeholder/thin pages with ads — policy violation\n' +
  '  • Ads on pages with insufficient content — minimum content requirement\n' +
  '  • Accidental ad clicks incentivized by layout — invalid click policy\n\n' +
  '━━━ ASMRREGISTRY — SITE STATUS ━━━\n' +
  '✅ FAQPage JSON-LD on [slug].astro (penalty-gate verified 2026-09-13)\n' +
  '✅ Pagination canonical + noindex,follow (penalty-gate verified 2026-09-13)\n' +
  '✅ Pagination D1 reads eliminated — HUB_DATA prebuild (2026-09-13)\n' +
  '✅ robots.txt: /video/ + /creator/ disallowed (2026-09-13)\n' +
  '✅ Author "Zoe Harlow" on all 231 published pages (2026-09-13)\n' +
  '✅ /about + /methodology pages exist (2026-09-13)\n' +
  '✅ 404 safety net: middleware converts all unknown 404s → 301 home (2026-09-13)\n' +
  '\n' +
  'CRITICAL — HCU AI DETECTION: author field set but NO first-person experience prose anywhere. "When I tested X..." missing from all 231 pages. Google quality raters look at prose, not just author field.\n' +
  'CRITICAL — CORE WEB VITALS: never measured. LCP/CLS/INP unknown. Cloudflare Workers SSR should be fast but video-heavy pages may fail LCP. Run PageSpeed Insights on /sleep/ and /tapping/.\n' +
  'HIGH — 16 UNGRINDED SLUGS: thin content drags domain HCU score. Either grind or add noindex + remove from sitemap.\n' +
  '  Slugs: asmr-and-highly-sensitive-person, best-binaural-microphone, best-asmr-for-focus, best-asmr-for-anxiety,\n' +
  '  best-asmr-channels-for-sleep, best-asmr-channels-for-anxiety, best-asmr-for-studying, best-asmr-microphones,\n' +
  '  asmr-equipment-guide, best-asmr-for-depression, asmr-for-insomnia, best-asmr-roleplay-channels,\n' +
  '  best-asmr-for-kids, asmr-brain-tingles, asmr-meditation, best-asmr-artists\n' +
  'HIGH — HUB-DATA-ALL.JSON STALENESS: baked at build time. No weekly deploy cron = stale "top videos" data. Force weekly Cloudflare Worker deploy.\n' +
  'HIGH — DUPLICATE INTENT: multiple ASMR intent pages may cannibalize each other (e.g. /sleep/ vs /insomnia/). Not audited.\n' +
  'MEDIUM — 8 DRAFT SLUGS in crossLinks: verify no live page links to a draft slug (broken internal link = crawl dead-end).\n' +
  'MEDIUM — SITEMAP lastmod: many pages have null lastUpdated → sitemap emits null lastmod → Google ignores freshness signal.\n' +
  'MEDIUM — NO GSC MONITORING: manual actions, coverage drops, crawl errors go undetected until rankings tank.\n' +
  'MEDIUM — NO INTERNAL LINK AUDIT: orphan pages possible if crossLinks misconfigured. Googlebot may not discover them.\n\n' +
  '━━━ CALCSCRAPE — SITE STATUS ━━━\n' +
  '✅ contentrates-audit.mjs: 0 stale errors as of 2026-09-13 (BLS May 2025 + EIA Sep 7 2026 data)\n' +
  '✅ /about (Michael Woo + LinkedIn, Person schema, verifiedYear 2026) + /methodology exist\n' +
  '✅ 404 safety net: [...gone].astro redirects unknown URLs → 301 home (2026-09-13)\n' +
  '\n' +
  'CRITICAL — YMYL FORMULA UNVERIFIED: no unit tests, no automated correctness gate. Wrong formula shown to thousands of users = permanent trust destruction. Fix: assert formula(inputs) === expected for each calc type.\n' +
  'CRITICAL — CORE WEB VITALS: never measured. Calculator pages with dynamic JS may fail INP (>200ms). LCP unknown. Run PageSpeed Insights on highest-traffic calc.\n' +
  '✅ SCHEMA EXISTS: WebPage + SoftwareApplication + BreadcrumbList + HowTo + PriceSpecification in [hub]/[slug].astro (confirmed 2026-09-13). FAQPage deliberately removed (Google deprecated Aug 2023).\n' +
  'MEDIUM — SCHEMA GAPS: Dataset for gov-data pages, FinancialProduct for loan calcs — add where semantically correct.\n' +
  'HIGH — E-E-A-T GAPS: /about + /methodology exist but per-page data source citations incomplete. Each calculator page should cite FRED/EIA/BEA/BLS as inline source.\n' +
  'HIGH — HUB VISIBILITY: new slugs not in hub-content/*.json = invisible to users + crawlers even if indexed.\n' +
  'HIGH — DUPLICATE CALCULATOR INTENT: cross-niche cannibalization not audited. Google deindexes duplicates.\n' +
  'HIGH — DEPLOY VERIFICATION: pipelineStage:live without cf-live-verify = unverified live status.\n' +
  'MEDIUM — NO FRESHNESS BANNER: contentRates >7 days shows no user-visible staleness warning on YMYL "current rates" pages — misinformation risk.\n' +
  'MEDIUM — INTRUSIVE INTERSTITIALS: verify no full-page popups on mobile load (newsletter, cookie banners) that block content before interaction.\n' +
  'MEDIUM — NO GSC MONITORING: manual actions, coverage drops go undetected.\n\n' +
  '━━━ VERDICT GATE ━━━\n' +
  'Before calling ANY item "done": (1) name the penalty category it addresses, (2) confirm fix is in code not just planned, (3) state blast radius if fix is wrong.\n' +
  '"Will implement" = not done. "Committed" ≠ deployed. "Should work" ≠ verified. Curl or read the file THIS session.'
);
process.exit(0);
