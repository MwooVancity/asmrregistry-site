#!/usr/bin/env node
// Turns unsourced "X% of people" prevalence claims into "some people".
// A sentence that cites a source (study, survey, year, journal...) is left alone.
// Usage: node tools/fix-unsourced-stats.mjs [--apply]
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { QUANT, SOURCE_CUE, QUANT_ES, SOURCE_CUE_ES } from './stat-patterns.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'src/lib/asmr-page-content.json');
const APPLY = process.argv.includes('--apply');
const data = JSON.parse(readFileSync(FILE, 'utf8'));


const SKIP_KEYS = new Set(['references', 'crossLinks', 'author', 'status', 'lastUpdated', 'slug', 'dataset', 'redirectTo']);
let changed = 0; const pages = new Set(); const samples = [];

function fixSentence(s, slug) {
  if (!SOURCE_CUE_ES.test(s)) {
    s = s.replace(QUANT_ES, (m, noun, off) => {
      const atStart = s.slice(0, off).replace(/[\s"'(]/g, '') === '';
      return (atStart ? 'Algunas ' : 'algunas ') + noun;
    });
  }
  if (SOURCE_CUE.test(s)) return s;
  return s.replace(QUANT, (m, noun, off) => {
    const atStart = s.slice(0, off).replace(/[\s"'(]/g, '') === '';
    return (atStart ? 'Some ' : 'some ') + noun;
  });
}
function fixHtml(str, slug) {
  const out = str.split(/(<[^>]+>)/).map(tok => {
    if (tok.startsWith('<')) return tok;
    return tok.split(/(?<=[.!?])(\s+)/).map(sen => {
      const f = fixSentence(sen, slug);
      if (f !== sen) { changed++; pages.add(slug); if (samples.length < 16) samples.push([slug, sen.trim().slice(0, 110), f.trim().slice(0, 110)]); }
      return f;
    }).join('');
  }).join('');
  return out;
}
function walk(v, slug) {
  if (typeof v === 'string') return fixHtml(v, slug);
  if (Array.isArray(v)) return v.map(x => walk(x, slug));
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) if (!SKIP_KEYS.has(k)) v[k] = walk(v[k], slug); return v; }
  return v;
}

for (const slug of Object.keys(data)) walk(data[slug], slug);
console.log(`sentences changed: ${changed} across ${pages.size} pages`);
for (const [s, a, b] of samples) console.log(`  [${s}]\n    - ${a}\n    + ${b}`);
if (APPLY) { writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8'); console.log('WRITTEN'); }
else console.log('(dry run; pass --apply to write)');
