#!/usr/bin/env node
/**
 * merge-kp-volumes.mjs
 * Parse Google KP CSV, match to build-queue.csv slugs by title, write out/build-queue-with-kp-vol.csv
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KP_CSV = process.argv[2] || resolve(process.env.USERPROFILE || process.env.HOME, 'Downloads', 'Saved Keywords Stats 2026-07-18 at 21_24_43.csv');

// Parse KP CSV (tab-separated, 3 header rows to skip, UTF-16 LE)
const kpRaw = readFileSync(KP_CSV).toString('utf16le');
const kpLines = kpRaw.split('\n').slice(3); // skip 3 header rows

// Build map: normalized keyword → avg monthly searches
const kpMap = new Map();
for (const line of kpLines) {
  const cols = line.split('\t');
  const kw = cols[0]?.trim().toLowerCase();
  const vol = parseFloat(cols[3]);
  if (kw && !isNaN(vol) && vol > 0) {
    kpMap.set(kw, vol);
  }
}
console.log(`KP entries with volume: ${kpMap.size}`);

// Build slug→title map from final-keywords-deduped.csv
const dedupRaw = readFileSync(resolve(ROOT, 'out/final-keywords-deduped.csv'), 'utf8');
const dedupLines = dedupRaw.split('\n').slice(1).filter(Boolean);
const slugToTitle = new Map();
for (const line of dedupLines) {
  const parts = line.split(',');
  const slug = parts[0]?.trim();
  const title = parts[1]?.trim();
  if (slug && title) slugToTitle.set(slug, title.toLowerCase());
}
console.log(`Slug→title map size: ${slugToTitle.size}`);

// Parse build-queue.csv
const bqRaw = readFileSync(resolve(ROOT, 'out/build-queue.csv'), 'utf8');
const bqLines = bqRaw.split('\n');
const header = bqLines[0];
const cols = header.split(',');
const slugIdx = cols.indexOf('slug');

if (slugIdx === -1) {
  console.error('No "slug" column. Columns:', cols.join(', '));
  process.exit(1);
}

let matched = 0, unmatched = 0;
const outLines = [header + ',kp_vol'];

for (const line of bqLines.slice(1)) {
  if (!line.trim()) continue;
  const fields = line.split(',');
  const slug = fields[slugIdx]?.trim();
  const title = slugToTitle.get(slug) || '';
  const vol = title ? (kpMap.get(title) ?? '') : '';
  if (vol !== '') matched++; else unmatched++;
  outLines.push(line + ',' + vol);
}

writeFileSync(resolve(ROOT, 'out/build-queue-with-kp-vol.csv'), outLines.join('\n'));
console.log(`Matched: ${matched} | Unmatched: ${unmatched}`);
console.log(`Written: out/build-queue-with-kp-vol.csv`);

// Top 20 by kp_vol
const volIdx = outLines[0].split(',').indexOf('kp_vol');
const ranked = outLines.slice(1)
  .map(l => { const f = l.split(','); return { slug: f[slugIdx], title: slugToTitle.get(f[slugIdx]) || f[slugIdx], vol: parseFloat(f[volIdx]) || 0 }; })
  .filter(r => r.vol > 0)
  .sort((a, b) => b.vol - a.vol);

console.log(`\nTop 20 by KP volume:`);
for (const r of ranked.slice(0, 20)) {
  console.log(`  ${r.vol.toLocaleString()}\t${r.title}`);
}
