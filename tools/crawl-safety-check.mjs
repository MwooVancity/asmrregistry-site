#!/usr/bin/env node
/**
 * crawl-safety-check.mjs — post-deploy live crawl safety audit.
 *
 * Fetches a sample of live pages and checks for:
 *   P0  noindex in <meta name="robots"> response
 *   P0  X-Robots-Tag: noindex in HTTP response headers
 *   P0  Missing canonical link
 *   P0  /_astro/ returns non-200 (JS bundle blocked)
 *   P1  Canonical doesn't match expected URL
 *
 * Usage: node tools/crawl-safety-check.mjs [--full] [--slug slug1,slug2]
 *   --full   check all published pages (slow — default checks 10 sample)
 *   --slug   check specific slugs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const FULL = args.includes('--full');
const slugArg = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : undefined;
const SITE = 'https://asmrregistry.com';

const data = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-page-content.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-keyword-ledger.json'), 'utf8'));
// Build slug→targetUrl map from ledger; fall back to /<slug>/ for unlisted slugs
const targetUrlMap = {};
for (const p of ledger.pages) targetUrlMap[p.slug] = p.targetUrl;

const allPublished = Object.keys(data).filter(s => data[s].status === 'published');

let slugs;
if (slugArg) {
  slugs = slugArg.split(',').map(s => s.trim());
} else if (FULL) {
  slugs = allPublished;
} else {
  // Sample: first 5 + last 5 alphabetically = covers both ends
  const sorted = [...allPublished].sort();
  slugs = [...sorted.slice(0, 5), ...sorted.slice(-5)];
}

let p0 = 0, p1 = 0;

console.log(`\n╔══════════════════════════════════════════════╗`);
console.log(`  asmrregistry crawl-safety-check (live)`);
console.log(`  Checking ${slugs.length} pages against ${SITE}`);
console.log(`╚══════════════════════════════════════════════╝\n`);

async function checkPage(slug) {
  const targetPath = targetUrlMap[slug] || `/${slug}/`;
  const url = `${SITE}${targetPath}`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (e) {
    console.error(`  🔴 P0 [${slug}] [fetch-failed] ${e.message}`);
    p0++;
    return;
  }

  if (res.status !== 200) {
    console.error(`  🔴 P0 [${slug}] [http-${res.status}] Expected 200, got ${res.status}`);
    p0++;
    return;
  }

  // X-Robots-Tag header
  const xRobots = res.headers.get('x-robots-tag') || '';
  if (/noindex/i.test(xRobots)) {
    console.error(`  🔴 P0 [${slug}] [x-robots-noindex] X-Robots-Tag: ${xRobots}`);
    p0++;
  }

  const html = await res.text();

  // Meta robots noindex
  const metaRobots = html.match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0] || '';
  if (/noindex/i.test(metaRobots)) {
    console.error(`  🔴 P0 [${slug}] [meta-noindex] ${metaRobots}`);
    p0++;
  }

  // Canonical present and correct
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (!canonicalMatch) {
    console.error(`  🔴 P0 [${slug}] [no-canonical] Missing canonical link tag`);
    p0++;
  } else {
    const canonical = canonicalMatch[1];
    const expected = `${SITE}${targetUrlMap[slug] || `/${slug}/`}`;
    if (canonical !== expected) {
      console.warn(`  🟡 P1 [${slug}] [canonical-mismatch] Expected "${expected}", got "${canonical}"`);
      p1++;
    }
  }
}

// Check /_astro/ is accessible — fetch a slug page and extract a bundle URL
async function checkAstroBundle() {
  // Use a known content slug that has JS (trigger hub pages always do)
  const probeUrl = `${SITE}/whispering/`;
  try {
    const res = await fetch(probeUrl, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const bundleMatch = html.match(/src=["'](\/\_astro\/[^"'?]+\.js)["']/);
    if (bundleMatch) {
      const bundleRes = await fetch(SITE + bundleMatch[1], { signal: AbortSignal.timeout(10000) });
      if (bundleRes.status !== 200) {
        console.error(`  🔴 P0 [/_astro/] [bundle-blocked] ${bundleMatch[1]} returned ${bundleRes.status} — Googlebot can't load JS on any page`);
        p0++;
      } else {
        console.log(`  ✅ /_astro/ bundle accessible (${bundleMatch[1].split('/').pop()})`);
      }
    } else {
      // No bundle in HTML = likely fully server-rendered, not a failure
      console.log(`  ✅ /_astro/ check skipped (no inline JS bundle found — SSR page)`);
    }
  } catch (e) {
    console.warn(`  🟡 P1 [/_astro/] [bundle-check-failed] ${e.message}`);
    p1++;
  }
}

await checkAstroBundle();

// Check pages sequentially to avoid hammering the server
for (const slug of slugs) {
  await checkPage(slug);
}

console.log('');
console.log(`  📊 P0 (blocking): ${p0} | P1 (warnings): ${p1}`);
if (p0 > 0) {
  console.error(`\n  ❌ CRAWL SAFETY: FAIL — ${p0} P0 issues found\n`);
  process.exit(1);
} else if (p1 > 0) {
  console.warn(`\n  ⚠  CRAWL SAFETY: WARN — ${p1} P1 issues, no blockers\n`);
  process.exit(0);
} else {
  console.log(`\n  ✅ CRAWL SAFETY: PASS — ${slugs.length} pages clean\n`);
  process.exit(0);
}
