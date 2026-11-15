#!/usr/bin/env node
// Scoreboard for the Unique Data rule (CLAUDE.md): which published pages show something a reader cannot get elsewhere?
// Counts a page as having unique data if it shows one of: catalog video data (hub pages), a data chart, an interactive
// tool, a dated PubMed count or named study from references. Prints coverage by page type and the worst gaps.
// Usage: node tools/unique-data-audit.mjs [--list]
import { readFileSync } from 'fs';
const d = JSON.parse(readFileSync('src/lib/asmr-page-content.json', 'utf8'));
const pages = JSON.parse(readFileSync('src/lib/asmr-keyword-ledger.json', 'utf8')).pages;
const type = Object.fromEntries(pages.map(p => [p.slug, p.pageType]));
const hub = /^(TRIGGER_HUB|INTENT_HUB)$/;
const facts = JSON.parse(readFileSync('src/lib/hub-data-all.json', 'utf8')).facts || {};
const research = JSON.parse(readFileSync('src/lib/research-counts.json', 'utf8'));
const signal = (s, p) => {
  const t = (p.introHtml || '') + (p.sections || []).map(x => x.content).join(' ');
  if (facts[s]) return 'catalog';
  if (research[s]) return 'research';
  if (hub.test(type[s] || '')) return 'catalog';
  if (p.dataset) return 'chart';
  if (/\/tools\//.test(t) && s === 'typing') return 'tool';
  if ((p.references || []).some(r => /pubmed|ncbi/i.test(r.url || ''))) return 'research';
  return null;
};
const by = {}; const gaps = [];
for (const [s, p] of Object.entries(d)) {
  if (p.status !== 'published') continue;
  const k = type[s] || 'UNLEDGERED', g = signal(s, p);
  (by[k] ||= { total: 0, has: 0 }).total++;
  if (g) by[k].has++; else gaps.push(`${k} ${s}`);
}
let t = 0, h = 0;
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].total - a[1].total)) { t += v.total; h += v.has; console.log(`${k.padEnd(14)} ${v.has}/${v.total}`); }
console.log(`TOTAL          ${h}/${t} content pages have unique data (${Math.round(100 * h / t)}%)`);
if (process.argv.includes('--list')) console.log(gaps.join('\n'));
