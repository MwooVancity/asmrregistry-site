#!/usr/bin/env node
/**
 * analyze_niche.mjs — GENERIC per-niche cluster + intent analyzer (replaces per-niche scripts).
 * Uses the canonical intent classifier (tools/lib/intent-classify.mjs). One command per niche.
 *
 * Usage:
 *   node tools/analyze_niche.mjs --in out/<niche>_utf8.tsv --niche <niche-id> \
 *     --keep "<entity-token regex>" [--drop "<contam regex>"] [--dedup "<owned-by-other-silo regex>"] \
 *     [--floor 100]
 *
 * --keep is a POSITIVE entity gate: a row is kept only if its keyword matches it. This is the
 * defense against seed-bleed (e.g. "base" pulling in log base / on-base % / acid base / base pay).
 * Output: livedatacalc/src/data/<niche>-clusters.json (committed pipeline data; out/ is gitignored).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyIntent, classifyCluster, INTENT_TEMPLATE } from './lib/intent-classify.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1]]); return a;
}, []));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, args.in);
const NICHE = args.niche;
const OUT = path.join(ROOT, 'livedatacalc', 'src', 'data', `${NICHE}-clusters.json`);
const KEEP = args.keep ? new RegExp(args.keep, 'i') : null;
const DROP = args.drop ? new RegExp(args.drop, 'i') : null;
const DEDUP = args.dedup ? new RegExp(args.dedup, 'i') : null;
const FLOOR = parseInt(args.floor || '100', 10);

const MODIFIERS = new Set('calculator calc cost costs price prices pricing how much many is are do does a an the of for per to my your i you it need needs needed coverage cover estimate estimator average avg near me vs in on with and or what when where why best top free online tool chart calculate calculated installed install installation labor diy 2024 2025 2026'.split(' '));
const clusterKey = (kw, parent) => {
  if (parent) return parent.toLowerCase().trim();
  const t = kw.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((x) => x && !MODIFIERS.has(x) && isNaN(x));
  return t.slice(0, 3).join(' ') || kw.toLowerCase();
};

const rows = fs.readFileSync(SRC, 'utf8').split(/\r?\n/).filter(Boolean);
rows.shift();
const clusters = new Map();
let dropped = 0, kept = 0;
for (const line of rows) {
  const c = line.split('\t').map((x) => x.replace(/^"|"$/g, ''));
  const kw = c[1], vol = parseInt(c[4] || '0', 10) || 0, cpc = parseFloat(c[5] || '0') || 0;
  const parent = c[7] || '', intents = c[14] || '';
  if (!kw) { dropped++; continue; }
  if (KEEP && !KEEP.test(kw)) { dropped++; continue; }          // positive entity gate
  if (DROP && DROP.test(kw)) { dropped++; continue; }
  if (/Branded|Navigational/.test(intents)) { dropped++; continue; }
  kept++;
  // Cluster by ENTITY × INTENT so one entity splits into its intent-pages
  // (artificial grass cost = MAT  vs  artificial grass installation cost = INSTALLED).
  const entity = clusterKey(kw, parent);
  const kwIntent = classifyIntent(kw);
  const key = entity + '::' + kwIntent;
  if (!clusters.has(key)) clusters.set(key, { parent: entity, intent: kwIntent, members: [], demand: 0, cpc: 0, commercial: 0 });
  const cl = clusters.get(key);
  cl.members.push({ kw, vol }); cl.demand += vol; cl.cpc = Math.max(cl.cpc, cpc);
  if (/Commercial|Transactional/.test(intents)) cl.commercial += vol;
}

const out = [...clusters.values()].map((cl) => {
  cl.members.sort((a, b) => b.vol - a.vol);
  const intent = cl.intent;                 // entity×intent key — uniform by construction
  const { mix } = classifyCluster(cl.members);
  return {
    parent: cl.parent, intent, intentTemplate: INTENT_TEMPLATE[intent], intentMix: mix,
    ahrefsIntent: cl.commercial > cl.demand * 0.3 ? 'Commercial' : 'Informational',
    demand: cl.demand, cpc: Math.round(cl.cpc * 100) / 100,
    keywordCount: cl.members.length, topKeyword: cl.members[0].kw,
    sampleKeywords: cl.members.slice(0, 6).map((m) => m.kw),
    dedupOwnedByOtherSilo: DEDUP && DEDUP.test(cl.parent) || undefined,
  };
}).filter((c) => c.demand >= FLOOR).sort((a, b) => b.demand - a.demand);

const doc = {
  _meta: {
    niche: NICHE, source: 'Ahrefs matching-terms export (US) 2026-06-11', generated: '2026-06-11',
    rowsIn: rows.length, kept, dropped, clustersOut: out.length, floor: FLOOR,
    intentField: 'scope intent via tools/lib/intent-classify.mjs (MAT|INSTALLED|SERVICE|RATE|COMPUTE|INFO). Not yet SERP-tiered.',
  },
  clusters: out,
};
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
const byIntent = out.reduce((a, c) => { a[c.intent] = (a[c.intent] || 0) + 1; return a; }, {});
console.log(`${NICHE}: ${out.length} clusters (kept ${kept}/${rows.length}, dropped ${dropped})`);
console.log('intent split:', JSON.stringify(byIntent));
console.log('dedup-flagged:', out.filter((c) => c.dedupOwnedByOtherSilo).length);
console.log('top 18:');
for (const c of out.slice(0, 18)) console.log(`  ${String(c.demand).padStart(6)} · ${c.intent.padEnd(9)} · ${c.parent}${c.dedupOwnedByOtherSilo ? '  [DEDUP]' : ''}`);
