#!/usr/bin/env node
// penalty-gate.mjs — Structural Google penalty check. Runs at prebuild.
// Fails the build (exit 1) if hard structural violations exist.
// Warns (exit 0) on fixable issues.
//
// Checks:
//   1. FAQPage JSON-LD in [slug].astro
//   2. Canonical tag in pagination [slug]/page/[page].astro
//   3. D1 reads still present in pagination (runtime risk)
//   4. /video/* NOT disallowed in robots.txt (noindex must be crawlable)
//   5. Draft slugs excluded from sitemap
//   6. CrossLink validation against published slugs

import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let errors = 0
let warnings = 0

function fail(msg) { console.error(`❌ PENALTY-GATE FAIL: ${msg}`); errors++ }
function warn(msg) { console.warn(`⚠️  PENALTY-GATE WARN: ${msg}`); warnings++ }
function ok(msg)   { console.log(`✅ ${msg}`) }

// ── 1. FAQPage JSON-LD in [slug].astro ──────────────────────────────────────
const slugAstro = join(root, 'src/pages/[slug].astro')
if (existsSync(slugAstro)) {
  const src = readFileSync(slugAstro, 'utf8')
  if (!src.includes('FAQPage') && !src.includes('faqPage')) {
    fail('[slug].astro missing FAQPage JSON-LD schema. faqItems exist but no structured data emitted. Rich results blocked for all 200+ pages.')
  } else {
    ok('[slug].astro has FAQPage schema')
  }
} else {
  warn('[slug].astro not found at expected path')
}

// ── 2. Canonical tag in pagination [slug]/page/[page].astro ─────────────────
const paginationAstro = join(root, 'src/pages/[slug]/page/[page].astro')
if (existsSync(paginationAstro)) {
  const src = readFileSync(paginationAstro, 'utf8')
  if (!src.includes('canonical')) {
    fail('[slug]/page/[page].astro missing canonical tag. Pagination pages treated as duplicate content. All hub pages at risk.')
  } else {
    ok('Pagination has canonical tag')
  }
  // ── 3. D1 reads in pagination ──────────────────────────────────────────────
  if (src.includes('getDb') || src.includes('D1Database') || (src.includes('.prepare(') && src.includes('.all('))) {
    fail('[slug]/page/[page].astro still has D1 runtime reads. Mid-day D1 limit = pagination 5xx = soft deindex. Must use prebuild hub data.')
  } else {
    ok('Pagination has no D1 runtime reads')
  }
} else {
  warn('[slug]/page/[page].astro not found — pagination penalty risks unverified')
}

// ── 4. robots.txt must NOT disallow noindexed /video/* ───────────────────────
// A Disallow hides the noindex tag, so Google indexes the bare URLs (427 did, GSC Oct 2026).
const robotsTxt = join(root, 'public/robots.txt')
if (existsSync(robotsTxt)) {
  const src = readFileSync(robotsTxt, 'utf8')
  if (/^Disallow:\s*\/video\//m.test(src)) {
    fail('robots.txt disallows /video/*: Google cannot see their noindex and indexes bare video URLs. Remove the Disallow.')
  } else {
    ok('robots.txt lets Google crawl /video/* so their noindex is seen')
  }
} else {
  warn('public/robots.txt not found — crawl budget uncontrolled')
}

// ── 5. Draft slugs excluded from sitemap ────────────────────────────────────
try {
  const data = JSON.parse(readFileSync(join(root, 'src/lib/asmr-page-content.json'), 'utf8'))
  const sitemapSrc = existsSync(join(root, 'src/pages/sitemap-pages.xml.ts'))
    ? readFileSync(join(root, 'src/pages/sitemap-pages.xml.ts'), 'utf8')
    : ''
  const draftSlugs = Object.entries(data)
    .filter(([, v]) => !v.status || v.status !== 'published')
    .map(([k]) => k)
  if (draftSlugs.length > 0) {
    // Check if sitemap filters by published status
    if (sitemapSrc && !sitemapSrc.includes('published')) {
      fail(`Sitemap may include draft slugs (${draftSlugs.length} drafts found: ${draftSlugs.slice(0,3).join(', ')}...). Draft pages in sitemap = crawl errors.`)
    } else {
      warn(`${draftSlugs.length} draft/unpublished slugs exist: ${draftSlugs.slice(0,5).join(', ')}. Verify sitemap excludes them.`)
    }
  } else {
    ok('No draft slugs found')
  }
} catch (e) {
  warn(`Could not check draft slugs: ${e.message}`)
}

// ── 6. CrossLink orphan check ────────────────────────────────────────────────
try {
  const data = JSON.parse(readFileSync(join(root, 'src/lib/asmr-page-content.json'), 'utf8'))
  const publishedSlugs = new Set(Object.entries(data).filter(([,v]) => v.status === 'published').map(([k]) => k))
  let brokenLinks = 0
  const brokenExamples = []
  for (const [slug, page] of Object.entries(data)) {
    if (!page.crossLinks) continue
    for (const link of page.crossLinks) {
      const target = typeof link === 'string' ? link : link.slug
      if (target && !publishedSlugs.has(target)) {
        brokenLinks++
        if (brokenExamples.length < 3) brokenExamples.push(`${slug} → ${target}`)
      }
    }
  }
  if (brokenLinks > 0) {
    warn(`${brokenLinks} crossLinks point to unpublished/missing slugs (PageRank drain): ${brokenExamples.join(', ')}`)
  } else {
    ok('All crossLinks resolve to published slugs')
  }
} catch (e) {
  warn(`Could not check crossLinks: ${e.message}`)
}

// ── 7. Author/E-E-A-T signal check ──────────────────────────────────────────
try {
  const data = JSON.parse(readFileSync(join(root, 'src/lib/asmr-page-content.json'), 'utf8'))
  const published = Object.entries(data).filter(([,v]) => v.status === 'published')
  const noAuthor = published.filter(([,v]) => !v.author && !v.authorBio).length
  if (noAuthor === published.length) {
    warn(`ALL ${noAuthor} published pages lack author/authorBio field. HCU AI detection risk: zero E-E-A-T experience signals.`)
  } else if (noAuthor > 0) {
    warn(`${noAuthor}/${published.length} published pages missing author field.`)
  } else {
    ok('All published pages have author field')
  }
} catch (e) {
  warn(`Could not check E-E-A-T author fields: ${e.message}`)
}

// ── 8. Sitemap noindex leak check ───────────────────────────────────────────
// Prevents placeholder/ungrinded pages from entering the sitemap.
// A page without introHtml renders noindex — sitemap + noindex = crawl budget waste + quality signal.
try {
  const data = JSON.parse(readFileSync(join(root, 'src/lib/asmr-page-content.json'), 'utf8'))
  const ledger = JSON.parse(readFileSync(join(root, 'src/lib/asmr-keyword-ledger.json'), 'utf8'))
  // Pages with no content in asmr-page-content.json would pass through the old sitemap bug
  // and render noindex. Gate: any ledger page with no content or no introHtml is a leak.
  const nocontentInLedger = []
  const nointroPublished = []
  for (const page of ledger.pages) {
    if (page.pageType === 'CREATOR_NAV') continue
    const content = data[page.slug]
    if (!content) { nocontentInLedger.push(page.slug); continue }
    if (content.status === 'published' && !content.introHtml?.trim()) {
      nointroPublished.push(page.slug)
    }
  }
  if (nocontentInLedger.length > 0) {
    warn(`${nocontentInLedger.length} ledger pages have no content entry — would enter sitemap as placeholders if sitemap guard fails: ${nocontentInLedger.slice(0,3).join(', ')}`)
  } else {
    ok('All ledger pages have content entries')
  }
  if (nointroPublished.length > 0) {
    fail(`${nointroPublished.length} published pages lack introHtml — renders noindex but marked published: ${nointroPublished.slice(0,3).join(', ')}`)
  } else {
    ok('All published pages have introHtml (no noindex/sitemap mismatch)')
  }
} catch (e) {
  warn(`Sitemap noindex leak check error: ${e.message}`)
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\npenalty-gate: ${errors} errors, ${warnings} warnings`)
if (errors > 0) {
  console.error(`\n🚨 PENALTY-GATE: ${errors} hard violation(s) — these are active Google penalty risks. Fix before deploy.`)
  process.exit(1)
} else {
  console.log('penalty-gate: no hard violations. Warnings above need attention but won\'t block build.')
  process.exit(0)
}
