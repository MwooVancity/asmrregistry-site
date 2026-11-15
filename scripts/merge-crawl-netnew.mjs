#!/usr/bin/env node
/**
 * merge-crawl-netnew.mjs
 *
 * STEP 1 (no args): dedup kw-crawl-discovered.json against final-keywords-deduped.csv,
 *   write out/crawl-netnew-titles.txt (KP import list) + out/crawl-netnew.csv (staging)
 *
 * STEP 2 (--merge <kp-csv>): read KP volume CSV, merge into final-keywords-deduped.csv,
 *   skip anything vol=0 or already present. Writes updated canonical shortlist.
 *
 * Usage:
 *   node scripts/merge-crawl-netnew.mjs
 *   node scripts/merge-crawl-netnew.mjs --merge "C:\Users\mwoo7\Downloads\<kp-export>.csv"
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DISCOVERED = resolve(ROOT, 'livedatacalc/state/kw-crawl-discovered.json');
const SHORTLIST  = resolve(ROOT, 'out/final-keywords-deduped.csv');
const NETNEW_CSV = resolve(ROOT, 'out/crawl-netnew.csv');
const NETNEW_TXT = resolve(ROOT, 'out/crawl-netnew-titles.txt');

// ── helpers ───────────────────────────────────────────────────────────────────

function slugToTitle(slug) {
  // "concrete-resurfacing-cost" → "concrete resurfacing cost calculator"
  return slug.replace(/-/g, ' ') + ' calculator';
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// True if two slugs are "same page" — exact or one is substring of other (root match)
function isDupe(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function guessHub(slug) {
  if (/roof|shingle|gutter|fascia|soffit|skylight/.test(slug)) return 'roofing';
  if (/floor|carpet|tile|hardwood|laminate|vinyl-plank|epoxy/.test(slug)) return 'flooring';
  if (/hvac|furnace|boiler|mini-split|ductwork|heat-pump|refrigerant|attic-fan/.test(slug)) return 'hvac';
  if (/electric|solar|generator|ev-charger|panel|transfer-switch|recessed|ceiling-fan/.test(slug)) return 'electrical';
  if (/plumb|pipe|drain|sewer|water-heater|sump|septic|toilet|pex/.test(slug)) return 'plumbing';
  if (/kitchen|bath|counter|cabinet|shower|bathtub|backsplash/.test(slug)) return 'kitchen-bath';
  if (/deck|patio|pergola|porch|paver|screen/.test(slug)) return 'deck-patio';
  if (/pool|hot-tub|spa/.test(slug)) return 'pool-hot-tub';
  if (/concrete|brick|retaining|stucco|driveway|sidewalk|stamp|masonry/.test(slug)) return 'masonry-concrete';
  if (/paint|stain/.test(slug)) return 'painting';
  if (/window|door|garage-door|sliding-door/.test(slug)) return 'windows-doors';
  if (/insul/.test(slug)) return 'insulation';
  if (/sidin/.test(slug)) return 'siding';
  if (/drywall/.test(slug)) return 'drywall';
  if (/fence/.test(slug)) return 'fencing';
  if (/landscap|sod|tree|lawn|stump/.test(slug)) return 'landscaping';
  if (/moving|storage/.test(slug)) return 'moving-storage';
  if (/clean|mold|pressure/.test(slug)) return 'cleaning';
  return 'other';
}

// ── STEP 1: dedup + output KP list ───────────────────────────────────────────

const args = process.argv.slice(2);
const mergeIdx = args.indexOf('--merge');

if (mergeIdx === -1) {
  // Load existing slugs
  const existing = new Set();
  const shortlistLines = readFileSync(SHORTLIST, 'utf8').split('\n').slice(1).filter(Boolean);
  for (const line of shortlistLines) {
    const slug = line.split(',')[0]?.trim();
    if (slug) existing.add(slug);
  }
  console.log(`Existing shortlist: ${existing.size} slugs`);

  // Load crawl discoveries
  if (!existsSync(DISCOVERED)) {
    console.error('No kw-crawl-discovered.json found. Run kw-crawl first.');
    process.exit(1);
  }
  const discovered = JSON.parse(readFileSync(DISCOVERED, 'utf8'));
  const discoveredSlugs = Object.keys(discovered);
  console.log(`Crawl discovered: ${discoveredSlugs.length} slugs`);

  // Dedup: skip if exact match OR root-match against existing
  const netNew = [];
  const dupes = [];
  for (const slug of discoveredSlugs) {
    const isDuplicate = [...existing].some(e => isDupe(slug, e));
    if (isDuplicate) {
      dupes.push(slug);
    } else {
      netNew.push(slug);
    }
  }

  // Secondary dedup within net-new (crawl may find near-dups of each other)
  const deduped = [];
  for (const slug of netNew) {
    const alreadyIn = deduped.some(e => isDupe(slug, e));
    if (!alreadyIn) deduped.push(slug);
  }

  console.log(`Dupes vs existing: ${dupes.length}`);
  console.log(`Internal dupes removed: ${netNew.length - deduped.length}`);
  console.log(`Net-new unique: ${deduped.length}`);

  // Write KP import list (titles, one per line — paste directly into KP)
  const titles = deduped.map(slugToTitle);
  writeFileSync(NETNEW_TXT, titles.join('\n'));
  console.log(`\nKP import list → out/crawl-netnew-titles.txt (${titles.length} titles)`);
  console.log('Paste into Google Keyword Planner → "Get search volume and forecasts"');
  console.log('Export CSV, then run:');
  console.log('  node scripts/merge-crawl-netnew.mjs --merge "<path-to-kp-export.csv>"');

  // Write staging CSV (slug, title, hub — no volume yet)
  const csvLines = ['slug,title,hub'];
  for (const slug of deduped) {
    const hub = guessHub(slug);
    const title = slugToTitle(slug);
    csvLines.push(`${slug},"${title}",${hub}`);
  }
  writeFileSync(NETNEW_CSV, csvLines.join('\n'));
  console.log(`Staging CSV → out/crawl-netnew.csv`);

  // Print by hub
  const byHub = {};
  for (const slug of deduped) {
    const h = guessHub(slug);
    (byHub[h] = byHub[h] || []).push(slug);
  }
  console.log('\nBy hub:');
  for (const [h, slugs] of Object.entries(byHub).sort((a,b) => b[1].length - a[1].length)) {
    console.log(`  ${h.padEnd(20)} ${slugs.length}`);
  }

  process.exit(0);
}

// ── STEP 2: merge KP volumes into canonical shortlist ────────────────────────

const kpCsvPath = args[mergeIdx + 1];
if (!kpCsvPath || !existsSync(kpCsvPath)) {
  console.error('--merge requires a valid path to KP export CSV');
  process.exit(1);
}

// Parse KP CSV — handles both UTF-16 LE (KP export) and UTF-8
let kpRaw;
const rawBuf = readFileSync(kpCsvPath);
// Detect UTF-16 LE BOM (FF FE)
if (rawBuf[0] === 0xFF && rawBuf[1] === 0xFE) {
  kpRaw = rawBuf.toString('utf16le');
} else {
  kpRaw = rawBuf.toString('utf8');
}
const kpLines = kpRaw.replace(/\r/g, '').split('\n');

// Find header row (skip KP boilerplate rows at top)
let headerIdx = kpLines.findIndex(l => /keyword|search term/i.test(l));
if (headerIdx === -1) headerIdx = 0;
const kpHeader = kpLines[headerIdx].split('\t');
const kwCol   = kpHeader.findIndex(h => /keyword|search term/i.test(h));
const volCol  = kpHeader.findIndex(h => /avg.*month|monthly/i.test(h));

if (kwCol === -1 || volCol === -1) {
  console.error('Cannot find keyword/volume columns in KP export.');
  console.error('Header:', kpHeader.join(' | '));
  process.exit(1);
}

// Build map: normalized title → volume
const kpMap = new Map();
for (const line of kpLines.slice(headerIdx + 1)) {
  const cols = line.split('\t');
  const kw = cols[kwCol]?.trim().toLowerCase();
  const volStr = cols[volCol]?.replace(/,/g, '').trim();
  const vol = parseFloat(volStr);
  if (kw && !isNaN(vol)) kpMap.set(normalize(kw), vol);
}
console.log(`KP entries parsed: ${kpMap.size}`);

// Load staging CSV (slug, title, hub)
if (!existsSync(NETNEW_CSV)) {
  console.error('out/crawl-netnew.csv not found. Run step 1 first (no --merge flag).');
  process.exit(1);
}
const stagingLines = readFileSync(NETNEW_CSV, 'utf8').split('\n').slice(1).filter(Boolean);

// Match each staging slug to KP volume via title
const toAdd = [];
let noVol = 0;
for (const line of stagingLines) {
  const [slug, titleRaw, hub] = line.split(',');
  const title = titleRaw?.replace(/"/g, '').trim().toLowerCase() || '';
  const vol = kpMap.get(normalize(title)) ?? kpMap.get(normalize(title.replace(' calculator', '')));
  if (!vol || vol === 0) { noVol++; continue; }
  // Guess niche from hub
  const niche = hub?.trim() || 'home';
  const keyword = slug.replace(/-/g, ' ');
  toAdd.push({ slug, title: titleRaw?.replace(/"/g, '').trim(), keyword, search_volume: vol, cpc: '', hub_name: niche, niche });
}

console.log(`Matched with volume: ${toAdd.length} | No volume / skip: ${noVol}`);
if (toAdd.length === 0) {
  console.log('Nothing to add. Done.');
  process.exit(0);
}

// Load existing shortlist
const shortlistRaw = readFileSync(SHORTLIST, 'utf8');
const shortlistLines = shortlistRaw.split('\n');
const header = shortlistLines[0]; // slug,title,keyword,search_volume,cpc,hub_name,niche

// Backup
writeFileSync(SHORTLIST + '.bak', shortlistRaw);
console.log('Backup → final-keywords-deduped.csv.bak');

// Existing slugs (for final exact-match guard)
const existingSlugs = new Set(shortlistLines.slice(1).filter(Boolean).map(l => l.split(',')[0]?.trim()));

let added = 0;
const newLines = [...shortlistLines.filter(Boolean)];
for (const row of toAdd) {
  if (existingSlugs.has(row.slug)) { console.log(`  skip (already exists): ${row.slug}`); continue; }
  newLines.push(`${row.slug},"${row.title}","${row.keyword}",${row.search_volume},${row.cpc},"${row.hub_name}","${row.niche}"`);
  added++;
}

writeFileSync(SHORTLIST, newLines.join('\n'));
console.log(`\nAdded ${added} net-new slugs to final-keywords-deduped.csv`);
console.log(`Total shortlist now: ${existingSlugs.size + added}`);

// Sort report
const topNew = toAdd.sort((a,b) => b.search_volume - a.search_volume).slice(0, 20);
console.log('\nTop 20 new by KP volume:');
for (const r of topNew) {
  console.log(`  ${String(r.search_volume).padStart(7)}  ${r.slug}`);
}
