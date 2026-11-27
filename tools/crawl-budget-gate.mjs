// Build gate (owner 2026-11-18: "make sure that never happens again"). asmrregistry shares Cloudflare's free
// 100,000 Worker requests/day with riverwaterlevels, the main income site. Crawlers fetching ~340K asmr pages
// used it all up and took the river site down. This blocks any build that lists more crawlable addresses than
// the shared budget can absorb, or that stops disallowing the per-video pages.
// Lift only when asmrregistry has its own budget: set ASMR_OWN_BUDGET=1 (paid Workers plan or its own account).
import { readFileSync, readdirSync } from 'node:fs';
const MAX = 20000; // ~1/5 of the shared daily budget even if a crawler fetched every listed page in one day
if (process.env.ASMR_OWN_BUDGET === '1') { console.log('crawl-budget-gate: own budget, skipped'); process.exit(0); }
const listed = readFileSync('public/robots.txt', 'utf8').split(/\r?\n/).map((l) => l.match(/^Sitemap:\s*\S+\/(sitemap-[\w-]+\.xml)/i)?.[1]).filter(Boolean);
let urls = 0;
for (const f of readdirSync('public').filter((f) => /^sitemap-.*\.xml$/.test(f) && !/^sitemap-videos-/.test(f) && listed.includes(f))) {
  urls += (readFileSync(`public/${f}`, 'utf8').match(/<url>/g) || []).length;
}
const robots = readFileSync('public/robots.txt', 'utf8');
const errs = [];
if (urls > MAX) errs.push(`${urls} crawlable sitemap URLs (max ${MAX})`);
if (!/^Disallow: \/creators\/\*\/v\/$/m.test(robots)) errs.push('robots.txt no longer disallows /creators/*/v/');
// The rule that keeps per-video requests from running the Worker at all (proven by live tail 2026-11-27).
if (!/^run_worker_first\s*=.*"!\/creators\/\*\/v\/\*"/m.test(readFileSync('wrangler.toml', 'utf8'))) errs.push('wrangler.toml lost run_worker_first "!/creators/*/v/*": per-video requests would count against the shared limit again');
if (errs.length) { console.error(`crawl-budget-gate FAIL: ${errs.join('; ')}. This would let crawlers exhaust the Cloudflare budget shared with riverwaterlevels.`); process.exit(1); }
console.log(`crawl-budget-gate: ${urls} crawlable sitemap URLs (max ${MAX}), per-video pages disallowed`);
