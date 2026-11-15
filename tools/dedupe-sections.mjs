#!/usr/bin/env node
// Drops later duplicate topic sections left behind when an "extend" step appended instead of merging.
// Two headings are duplicates when they share 2+ content words after removing the page's own keywords.
// Rule: keep the earlier block, drop the later one. Never drop if the page would fall under MIN_WORDS,
// or under 4 blocks, or fail the pre-push minimums (sections>=3 or proTips>=3).
// Usage: node tools/dedupe-sections.mjs [--apply] [--min-pairs N] [--slug a,b]
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'src/lib/asmr-page-content.json');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const MIN_PAIRS = args.includes('--min-pairs') ? Number(args[args.indexOf('--min-pairs') + 1]) : 3;
const ONLY = args.includes('--slug') ? args[args.indexOf('--slug') + 1].split(',') : null;
const MIN_WORDS = 1500;

const d = JSON.parse(readFileSync(FILE, 'utf8'));
const strip = x => (x || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const wc = x => strip(x).split(/\s+/).filter(Boolean).length;
const STOP = new Set('the a an and or of to for in on is it your you why how what do does when with that this are be not can from at by as more most best use using work works working which who where tonight often really actually every all any one two three'.split(' '));
const stem = w => w.replace(/(ing|ed|es|s)$/, '');
const BSTOP = new Set('the a an and or of to for in on is it your you are be not can from at by as more most that this with when what which who where have has had will would should could they them their there then than also just very much many some any one two three if but so do does did its into out up down over under about each other such how why all every still only even get got make makes like use used using way ways thing things people person'.split(' '));
const bstem = w => w.replace(/(ing|ed|es|s|ly)$/, '');
const bvec = t => { const m = new Map(); for (const w of strip(t).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ')) { if (w.length < 4 || BSTOP.has(w)) continue; const k = bstem(w); m.set(k, (m.get(k) || 0) + 1); } return m; };
const bcos = (a, b) => { let dot = 0, na = 0, nb = 0; for (const [k, v] of a) { na += v * v; if (b.has(k)) dot += v * b.get(k); } for (const v of b.values()) nb += v * v; return dot / Math.sqrt((na || 1) * (nb || 1)); };
const SKIP_H = /^(key takeaways|what the research says|frequently|faq|sources|practical tips|quick tips|what to try tonight)/i;

const report = [];
let totalDropped = 0;
for (const slug of Object.keys(d)) {
  if (ONLY && !ONLY.includes(slug)) continue;
  const p = d[slug];
  if (p.status !== 'published') continue;
  const intro = (p.introHtml || '').split(/(?=<h2)/i);
  const opening = /^<h2/i.test(intro[0]) ? null : intro.shift();
  const blocks = [
    ...intro.map((html, i) => ({ src: 'intro', i, html, h: strip((html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || '') })),
    ...(p.sections || []).map((s, i) => ({ src: 'sec', i, html: s.content, h: strip(s.heading), s })),
  ].filter(b => b.h);
  const slugWords = new Set(slug.split('-').map(stem).concat(strip(p.h1 || '').toLowerCase().split(/\W+/).map(stem)));
  const W = blocks.map(b => new Set(b.h.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 2 && !STOP.has(w)).map(stem).filter(w => !slugWords.has(w))));
  const dup = new Set(); const log = [];
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    if (SKIP_H.test(blocks[i].h) || SKIP_H.test(blocks[j].h) || dup.has(i) || dup.has(j)) continue;
    let n = 0; for (const w of W[i]) if (W[j].has(w)) n++;
    const cs = bcos(bvec(blocks[i].html), bvec(blocks[j].html));
    if ((n >= 2 && cs >= 0.45) || cs >= 0.6) { dup.add(j); log.push(`${blocks[j].h.slice(0, 48)}  [dup of: ${blocks[i].h.slice(0, 40)}] cos ${cs.toFixed(2)}`); }
  }
  if (dup.size < MIN_PAIRS) continue;

  // apply with safeguards, dropping latest first
  let words = wc((p.introHtml || '') + ' ' + (p.sections || []).map(s => s.content).join(' '));
  const keepSections = [...(p.sections || [])]; const keepIntro = [...intro];
  const dropped = [];
  for (const j of [...dup].sort((a, b) => b - a)) {
    const b = blocks[j]; const w = wc(b.html);
    const secLeft = b.src === 'sec' ? keepSections.length - 1 : keepSections.length;
    if (words - w < MIN_WORDS) continue;
    if (secLeft < 3 && (p.proTips || []).length < 3) continue;
    if (b.src === 'sec') keepSections.splice(keepSections.findIndex(s => s === b.s), 1); else keepIntro.splice(keepIntro.indexOf(b.html), 1);
    words -= w; dropped.push(`${b.src}:${b.h.slice(0, 50)} (${w}w) ${log.find(l => l.startsWith(b.h.slice(0, 48))) || ''}`);
  }
  if (!dropped.length) { report.push({ slug, note: 'safeguards blocked all drops', pairs: dup.size }); continue; }
  report.push({ slug, pairs: dup.size, dropped, after: words });
  totalDropped += dropped.length;
  if (APPLY) { p.introHtml = (opening || '') + keepIntro.join(''); p.sections = keepSections; p.lastUpdated = '2026-10-19T02:00:00.000Z'; }
}
console.log(`pages with >=${MIN_PAIRS} duplicate topics: ${report.length} | sections to drop: ${totalDropped}`);
for (const r of report) console.log(`\n${r.slug} (${r.pairs} dup pairs${r.after ? ', ' + r.after + 'w after' : ''}) ${r.note || ''}\n  - ` + (r.dropped || []).join('\n  - '));
if (APPLY) { writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); console.log('\nWRITTEN'); } else console.log('\n(dry run, pass --apply)');
