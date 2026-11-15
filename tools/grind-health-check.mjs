#!/usr/bin/env node
/**
 * grind-health-check.mjs — pre-grind health gate for asmrregistry.
 *
 * Run BEFORE every grind batch. Checks all published pages for live spam signals.
 * Exit 1 if any P0 found. Exit 0 otherwise (P1s printed as warnings).
 *
 * Checks:
 *   P0  Missing author field
 *   P0  Missing metaDescription
 *   P0  Missing introHtml
 *   P0  Em dash or double-hyphen in any text field
 *   P0  Hard jargon (parasympathetic, neurological, physiological, cognitive, cortisol, stimuli)
 *   P1  AI filler words (furthermore, leverage, utilize, seamless, crucial, essential, etc.)
 *   P1  FAQ < 3 items
 *   P1  metaDescription > 160 chars
 *   P1  Thin introHtml (< 200 words)
 *   P2  No crossLinks (informational only)
 *
 * Crawl safety checks (run before content loop, always):
 *   P0  robots.txt blocks /_astro/, /_worker.js, or /cdn-cgi/
 *   P0  robots.txt has User-agent: Googlebot with any Disallow
 *   P0  robots.txt has Crawl-delay directive
 *   P0  Published page would get noindex (no introHtml AND no videos possible)
 *   P1  Sitemap coverage: published pages not matched by sitemap logic
 *
 * Usage: node tools/grind-health-check.mjs [--slug slug1,slug2] [--fix]
 *   --slug  check only these slugs (comma-separated); default = all published
 *   --fix   auto-fix P0 em-dash + jargon + author issues and save
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { QUANT, POPULATION, SOURCE_CUE, TESTIMONIAL, QUANT_ES, SOURCE_CUE_ES } from './stat-patterns.mjs';
const HEALTH_SLUG = /anxiety|stress|sleep|insomnia|ptsd|trauma|depress|(?:^|-)pain(?:$|-)|migraine|headache|nausea|panic|adhd|tinnitus|autis|(?:^|-)ocd(?:$|-)|misophonia|kids|babies|seniors|meditation|relax|vagus|dopamine|immun/;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const slugArg = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : undefined;
const FIX = args.includes('--fix');
const CONTENT_PATH = join(ROOT, 'src/lib/asmr-page-content.json');

const data = JSON.parse(readFileSync(CONTENT_PATH, 'utf8'));
const allPublished = Object.keys(data).filter(s => data[s].status === 'published');
const slugs = slugArg ? slugArg.split(',').map(s => s.trim()) : allPublished;

// ── Constants ────────────────────────────────────────────────────────────────
const JARGON = ['parasympathetic','neurological','physiological','cognitive','cortisol','stimuli','mirror neurons'];
const JARGON_MAP = { parasympathetic:'calming', neurological:'brain-based', physiological:'physical', cognitive:'mental', cortisol:'stress hormone', stimuli:'triggers', 'mirror neurons':'mirror cells' };
// 'essential' excluded — too many false positives (essential oils, etc.)
// 'seamless/seamlessly' excluded — legitimate descriptor for audio looping
const AI_FILLER = ['furthermore','moreover','delve into','leverage','utilize','foster','harness','embark','holistic','paradigm','cornerstone','game-changer','it\'s worth noting','when it comes to','in conclusion','in summary','navigating the','ensuring that','by leveraging','take a deep dive'];
const EM_RE = /—|–| -- /g;
const JARGON_RE = new RegExp(JARGON.join('|'), 'gi');
const FILLER_RE = new RegExp('\\b(' + AI_FILLER.map(w => w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|') + ')\\b', 'gi');

function stripHtml(s) { return (s || '').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function wc(s) { return stripHtml(s).split(/\s+/).filter(Boolean).length; }
function allText(p) {
  return [p.introHtml, p.metaDescription, p.metaTitle,
    ...(p.sections||[]).flatMap(s=>[s.heading,s.content]),
    ...(p.faqItems||[]).flatMap(f=>[f.question,f.answer,f.shortAnswer]),
    ...(p.proTips||[])].filter(Boolean).join(' ');
}

// ── Counters ─────────────────────────────────────────────────────────────────
let p0 = 0, p1 = 0, fixCount = 0;
const report = [];

function emit(sev, slug, label, msg) {
  report.push({ sev, slug, label, msg });
  if (sev === 'P0') { console.error(`  🔴 P0 [${slug}] [${label}] ${msg}`); p0++; }
  else              { console.warn( `  🟡 P1 [${slug}] [${label}] ${msg}`); p1++; }
}
function ok(slug, label) { /* silent */ }

// ── Auto-fix helpers ──────────────────────────────────────────────────────────
function fixText(s) {
  if (!s) return s;
  let t = s.replace(EM_RE, m => m === ' -- ' ? ', ' : ',');
  t = t.replace(JARGON_RE, m => JARGON_MAP[m.toLowerCase()] || m);
  return t;
}
function fixPage(p) {
  if (!p.author) { p.author = 'zoe-harlow'; fixCount++; }
  const fields = ['introHtml','metaDescription','metaTitle'];
  for (const f of fields) { if (p[f]) p[f] = fixText(p[f]); }
  if (p.sections) p.sections = p.sections.map(s => ({...s, content: fixText(s.content), heading: fixText(s.heading)}));
  if (p.faqItems) p.faqItems = p.faqItems.map(f => ({...f, question: fixText(f.question), answer: fixText(f.answer), shortAnswer: fixText(f.shortAnswer)}));
  if (p.proTips) p.proTips = p.proTips.map(fixText);
}

// ── Crawl safety audit (P0 — runs before content loop, always) ───────────────
const ROBOTS_PATH = join(ROOT, 'public/robots.txt');
let crawlP0 = 0;
try {
  const robotsTxt = readFileSync(ROBOTS_PATH, 'utf8');
  const rawLines = robotsTxt.split('\n').map(l => l.trim());

  // 1. Critical path blocks — /_astro/ etc. break Googlebot JS/CSS rendering
  const CRITICAL_PATHS = ['/_astro/', '/_worker.js', '/cdn-cgi/'];
  const disallowLines = rawLines.filter(l => /^Disallow:/i.test(l));
  for (const line of disallowLines) {
    const path = line.replace(/^Disallow:\s*/i, '').trim();
    if (!path) continue; // empty Disallow = allow all, fine
    for (const critical of CRITICAL_PATHS) {
      if (path === critical || critical.startsWith(path) || path.startsWith(critical.replace(/\/$/, ''))) {
        console.error(`  🔴 P0 [robots.txt] [crawl-block] Blocks "${path}" — Googlebot JS/CSS rendering fails on all pages`);
        p0++; crawlP0++;
      }
    }
  }

  // 2. Googlebot-specific block — User-agent: Googlebot with any Disallow
  let inGooglebotBlock = false;
  for (const line of rawLines) {
    if (/^User-agent:\s*Googlebot$/i.test(line)) { inGooglebotBlock = true; continue; }
    if (/^User-agent:/i.test(line)) { inGooglebotBlock = false; continue; }
    if (inGooglebotBlock && /^Disallow:\s*.+/.test(line)) {
      console.error(`  🔴 P0 [robots.txt] [googlebot-block] Googlebot-specific Disallow: "${line}" — blocks Google crawler directly`);
      p0++; crawlP0++;
    }
  }

  // 3. Crawl-delay — slows Googlebot recrawl rate, hurts recovery after incidents
  if (rawLines.some(l => /^Crawl-delay:/i.test(l))) {
    console.error(`  🔴 P0 [robots.txt] [crawl-delay] Crawl-delay directive found — remove it, Google ignores it but it signals slow sites`);
    p0++; crawlP0++;
  }

  if (crawlP0 === 0) console.log(`  ✅ robots.txt: no critical path blocks, no Googlebot block, no crawl-delay`);
} catch {
  console.error(`  🔴 P0 [robots.txt] [missing] public/robots.txt not found`);
  p0++; crawlP0++;
}

// 4. Noindex risk on published pages — check which published slugs would get noindex
//    [slug].astro logic: noindex if status=draft OR (!introHtml AND totalVideoCount===0)
//    We can only check status=draft here (video counts are runtime). Flag draft status on published slugs.
{
  const store = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-page-content.json'), 'utf8'));
  const publishedSlugs = Object.keys(store).filter(s => store[s].status === 'published');
  let noindexRisk = 0;
  for (const slug of publishedSlugs) {
    const p = store[slug];
    // If published but has no introHtml: runtime will noindex unless videos exist
    // Pages with no introHtml AND likely no videos = definite noindex
    if (!p.introHtml) {
      console.warn(`  🟡 P1 [${slug}] [noindex-risk] Published but no introHtml — will get noindex if page has no videos`);
      p1++; noindexRisk++;
    }
  }
  if (noindexRisk === 0) console.log(`  ✅ noindex-risk: all published pages have introHtml`);
}

// 5. Sitemap coverage — published pages must appear in sitemap logic
//    Sitemap includes all ledger pages with status=published + non-ledger published pages
//    Simple check: count published pages vs expected minimum
{
  const store = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-page-content.json'), 'utf8'));
  const publishedCount = Object.keys(store).filter(s => store[s].status === 'published').length;
  // Sitemap generation mirrors this logic, so if all published have content they're included
  // Just validate count is non-zero and not suspiciously low
  if (publishedCount < 10) {
    console.error(`  🔴 P0 [sitemap] [coverage] Only ${publishedCount} published pages found — sitemap will be near-empty`);
    p0++;
  } else {
    console.log(`  ✅ sitemap-coverage: ${publishedCount} published pages eligible for sitemap`);
  }
}

// ── Main audit loop ───────────────────────────────────────────────────────────
console.log(`\n╔══════════════════════════════════════════════╗`);
console.log(`  asmrregistry grind-health-check`);
console.log(`  Checking ${slugs.length} of ${allPublished.length} published pages`);
console.log(`╚══════════════════════════════════════════════╝\n`);

for (const slug of slugs) {
  const p = data[slug];
  if (!p) { emit('P0', slug, 'missing', 'not found in content JSON'); continue; }
  if (p.status !== 'published') continue;

  if (FIX) fixPage(p);

  // P0 checks
  if (!p.author)          emit('P0', slug, 'author',   'missing author field — E-E-A-T gap');
  if (!p.introHtml)       emit('P0', slug, 'intro',    'missing introHtml — page has no content');
  if (!p.metaDescription) emit('P0', slug, 'meta',     'missing metaDescription');

  const text = allText(p);
  if (EM_RE.test(text))      emit('P0', slug, 'em-dash',  'em dash or double-hyphen found — gate failure');
  const jargonHit = JARGON.find(j => text.toLowerCase().includes(j));
  if (jargonHit)             emit('P0', slug, 'jargon',   `banned jargon: "${jargonHit}"`);

  // P0: invented evidence. Prevalence stats need a named source in the same sentence; testimonials are never allowed.
  const proseText = [p.introHtml, ...(p.sections||[]).map(s=>s.content), ...(p.faqItems||[]).map(f=>f.answer), ...(p.proTips||[])].map(stripHtml).join(' ');

  // P0: invented anecdote about a named or aged person ("Mara is 34 and works...", "He was 19 when..."). Slipped past
  // the testimonial check on 2 pages until Oct 2026.
  // Name + age only counts with an age-story continuation, so "Volume is 30 percent" or "Episode was 12 minutes" pass.
  const anecdote = proseText.match(/\b[A-Z][a-z]+ (?:is|was) \d{2}(?: years old|,| and (?:works|lives|has|had|is|was)| when)|\b(?:she|he) (?:told us|said that|says that)\b|\b(?:He|She) was \d{2}\b/);
  if (anecdote)              emit('P0', slug, 'anecdote', `invented anecdote: "${anecdote[0]}"`);

  // P0: fake first-hand testing. The site tests nothing and has no named expert (AdSense trust failure, Oct 2026).
  const fakeExp = proseText.match(/\b(we|I)(?:'ve| have)? (tested|compared|measured|reviewed|tried) (?!to\b)|\bin our (testing|tests|experience)\b|\byears in the (ASMR )?community\b|\bafter testing\b/i);
  if (fakeExp)               emit('P0', slug, 'fake-experience', `claims first-hand testing: "${fakeExp[0].trim()}"`);
  for (const sent of proseText.split(/(?<=[.!?])\s+/)) {
    if (SOURCE_CUE.test(sent)) continue;
    if (sent.match(QUANT) || POPULATION.test(sent) || (!SOURCE_CUE_ES.test(sent) && sent.match(QUANT_ES))) { emit('P0', slug, 'unsourced-stat', `prevalence stat without a source: "${sent.slice(0, 110)}"`); break; }
  }
  const testi = proseText.match(TESTIMONIAL);
  if (testi) emit('P0', slug, 'testimonial', `untraceable testimonial: "${testi[0]}"`);
  if (HEALTH_SLUG.test(slug) && !/\b(no study|no studies|PubMed|small stud|limited|not (?:been )?(?:shown|tested|proven)|early)\b/i.test(proseText)) {
    emit('P1', slug, 'no-evidence-note', 'health topic with no statement of what research exists');
  }

  // P1: SERP-facing metadata must be intentional, not generated fallbacks
  if (!p.title) emit('P1', slug, 'no-title', 'no explicit title: falls back to a generated one');
  else if (/\s[-—]\sASMR Registry$|--|\b[Aa]smr\b/.test(p.title)) emit('P1', slug, 'bad-title', `title looks generated: "${p.title}"`);
  else if (p.title.length > 62) emit('P1', slug, 'title-long', `title ${p.title.length} chars (truncates in results): "${p.title}"`);
  if (!p.h1) emit('P1', slug, 'no-h1', 'no explicit h1');
  if (/^Practical guide to|, what works, what to try first/i.test(p.metaDescription || '')) emit('P1', slug, 'template-meta', 'metaDescription is the placeholder template');

  // P1 checks
  const fillerHit = AI_FILLER.find(w => text.toLowerCase().includes(w.toLowerCase()));
  if (fillerHit)             emit('P1', slug, 'ai-filler', `AI filler: "${fillerHit}"`);
  if ((p.faqItems||[]).length < 3) emit('P1', slug, 'faq', `only ${(p.faqItems||[]).length} FAQ items (min 3)`);
  if (p.metaDescription && p.metaDescription.length > 160) emit('P1', slug, 'meta-len', `metaDescription ${p.metaDescription.length} chars (max 160)`);
  // Thin = the whole page is short. Intros are answer-first and short by design (master prompt, Oct 2026).
  const pageWc = wc((p.introHtml || '') + ' ' + (p.sections || []).map(s => s.content).join(' '));
  if (pageWc < 400) emit('P1', slug, 'thin-page', `page body only ${pageWc} words (min 400)`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (FIX && fixCount > 0) {
  writeFileSync(CONTENT_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`  🔧 Auto-fixed ${fixCount} issues and saved content JSON`);
}

if (p0 === 0 && p1 === 0) {
  console.log(`  ✅ HEALTH: PASS — ${slugs.length} pages clean\n`);
  process.exit(0);
} else {
  console.log(`  📊 P0 (blocking): ${p0} | P1 (warnings): ${p1}`);
  if (p0 > 0) {
    console.error(`\n  ❌ HEALTH: FAIL — fix P0 issues before grinding\n`);
    process.exit(1);
  } else {
    console.warn(`\n  ⚠  HEALTH: WARN — P1 issues present, grind may proceed\n`);
    process.exit(0);
  }
}
