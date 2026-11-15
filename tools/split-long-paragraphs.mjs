#!/usr/bin/env node
// Splits <p> blocks with more than 4 sentences (or >300 chars and >3) into paragraphs of <=3 sentences.
// Only plain <p>...</p> without attributes. Sentence break = . ! ? followed by space + capital/quote/<, not after a known abbreviation.
// Usage: node tools/split-long-paragraphs.mjs [--apply]
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'src/lib/asmr-page-content.json');
const APPLY = process.argv.includes('--apply');
const d = JSON.parse(readFileSync(FILE, 'utf8'));
const ABBR = /(?:\b(?:vs|e\.g|i\.e|etc|Dr|Mr|Mrs|Ms|St|No|approx|Fig|al)|\b[A-Z])\.$/;
const splitSentences = t => {
  const out = []; let cur = '';
  const parts = t.split(/(?<=[.!?]["')\]]?)\s+(?=["'(<A-Z0-9])/);
  for (const part of parts) {
    cur = cur ? cur + ' ' + part : part;
    if (ABBR.test(cur)) continue;
    out.push(cur); cur = '';
  }
  if (cur) out.push(cur);
  return out;
};
const fix = html => {
  let changed = 0;
  const res = html.replace(/<p>([\s\S]*?)<\/p>/g, (m, inner) => {
    const plain = inner.replace(/<[^>]+>/g, '');
    const s = splitSentences(inner);
    if (!(s.length > 4 || (plain.length > 300 && s.length > 3))) return m;
    // balanced chunks of <=3
    const n = Math.ceil(s.length / 3), size = Math.ceil(s.length / n);
    const chunks = [];
    for (let i = 0; i < s.length; i += size) chunks.push(s.slice(i, i + size).join(' '));
    // never split inside an inline tag
    if (chunks.some(c => (c.match(/<(strong|em|a)\b/g) || []).length !== (c.match(/<\/(strong|em|a)>/g) || []).length)) return m;
    changed++;
    return chunks.map(c => '<p>' + c + '</p>').join('');
  });
  return [res, changed];
};
let pages = 0, paras = 0;
for (const [slug, p] of Object.entries(d)) {
  if (p.status !== 'published') continue;
  let c = 0;
  let r;
  [r, c] = fix(p.introHtml || ''); if (c) { p.introHtml = r; }
  let tot = c;
  for (const s of p.sections || []) { [r, c] = fix(s.content || ''); if (c) { s.content = r; tot += c; } }
  if (tot) { pages++; paras += tot; }
}
console.log(`paragraphs split: ${paras} across ${pages} pages`);
if (APPLY) { writeFileSync(FILE, JSON.stringify(d, null, 2), 'utf8'); console.log('WRITTEN'); } else console.log('(dry run)');
