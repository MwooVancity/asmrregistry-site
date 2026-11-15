#!/usr/bin/env node
// Applies a rewrite batch {slug:{introHtml,faqItems,proTips,references?}} after validation.
// Usage: node tools/apply-rewrites.mjs <batch.json>
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const f = join(dirname(fileURLToPath(import.meta.url)), '..', 'src/lib/asmr-page-content.json');
const o = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const d = JSON.parse(readFileSync(f, 'utf8'));
const t = x => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
let ok = 0; const rej = [];
for (const [s, n] of Object.entries(o)) {
  const p = d[s]; const why = [];
  if (!p) why.push('noslug'); else {
    if (t(n.introHtml).length < 500) why.push('short');
    if ((n.faqItems || []).length < 3) why.push('faq');
    if ((n.proTips || []).length < 3 || n.proTips.some(x => x.split(' ').length < 15)) why.push('tips');
    if (/[—–]/.test(JSON.stringify(n))) why.push('dash');
    for (const a of n.introHtml.matchAll(/href="(\/[^"]+)"/g)) {
      const u = a[1]; if (/^\/(tools|creators)\/|^\/$|^\/(guides|best|gear)\/$/.test(u)) continue;
      const sl = u.replace(/^\/(guides|best|gear)\//, '').replace(/\//g, '');
      if (!(d[sl] && d[sl].status === 'published')) why.push('link:' + u);
    }
  }
  if (why.length) { rej.push(s + ':' + why.join('+')); continue; }
  p.introHtml = n.introHtml; p.sections = []; p.faqItems = n.faqItems; p.proTips = n.proTips;
  if (n.references && n.references.length) p.references = n.references;
  p.lastUpdated = new Date().toISOString(); ok++;
}
writeFileSync(f, JSON.stringify(d, null, 2), 'utf8');
console.log('applied', ok, 'rejected', rej.join(' | ') || 'none');
