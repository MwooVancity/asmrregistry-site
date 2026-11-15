#!/usr/bin/env node
// Technical SEO pass over every page in sitemap-pages.xml: status, response time, HTML size, title and meta
// description (missing, too long, duplicated), H1 count, canonical pointing elsewhere, stray noindex, visible word
// count. Read-only. Usage: node tools/tech-audit.mjs [--list]
const SITE = 'https://asmrregistry.com';
const LIST = process.argv.includes('--list');
const sm = await (await fetch(SITE + '/sitemap-pages.xml')).text();
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const rows = [];
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < urls.length) {
    const u = urls[i++]; const t0 = Date.now();
    try {
      const r = await fetch(u, { redirect: 'manual' }); const h = await r.text(); const ms = Date.now() - t0;
      const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
      const canon = (h.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || '';
      const text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>|<nav[\s\S]*?<\/nav>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
      rows.push({ u: new URL(u).pathname, status: r.status, ms, kb: Math.round(h.length / 1024), title, desc, canon, h1: (h.match(/<h1[\s>]/g) || []).length, noindex: /<meta name="robots" content="[^"]*noindex/.test(h), words: text.split(/\s+/).filter(Boolean).length });
    } catch (e) { rows.push({ u, status: 0, ms: 0 }); }
  }
}));
const dup = (k) => { const m = {}; for (const r of rows) if (r[k]) (m[r[k]] ||= []).push(r.u); return Object.entries(m).filter(([, a]) => a.length > 1); };
const sec = (name, arr) => { console.log(`\n## ${name}: ${arr.length}`); if (arr.length) console.log((LIST ? arr : arr.slice(0, 8)).join('\n')); };
const ms = rows.map((r) => r.ms).sort((a, b) => a - b); const kb = rows.map((r) => r.kb).sort((a, b) => a - b); const w = rows.map((r) => r.words).sort((a, b) => a - b);
console.log(`pages ${rows.length} | response ms median ${ms[ms.length >> 1]} p90 ${ms[Math.floor(ms.length * 0.9)]} | HTML KB median ${kb[kb.length >> 1]} max ${kb[kb.length - 1]} | visible words median ${w[w.length >> 1]} min ${w[0]}`);
sec('Not 200', rows.filter((r) => r.status !== 200).map((r) => `${r.u} ${r.status}`));
sec('Noindex but in sitemap', rows.filter((r) => r.noindex).map((r) => r.u));
sec('Canonical points elsewhere', rows.filter((r) => r.canon && new URL(r.canon).pathname !== r.u).map((r) => `${r.u} -> ${r.canon}`));
sec('Missing or not exactly one H1', rows.filter((r) => r.h1 !== 1).map((r) => `${r.u} (${r.h1})`));
sec('Title over 60 chars', rows.filter((r) => r.title.length > 60).map((r) => `${r.title.length} ${r.u}`));
sec('Description missing or over 160', rows.filter((r) => !r.desc || r.desc.length > 160).map((r) => `${r.desc.length} ${r.u}`));
sec('Duplicate titles', dup('title').map(([t, a]) => `${a.length}x "${t.slice(0, 60)}": ${a.slice(0, 3).join(' ')}`));
sec('Duplicate descriptions', dup('desc').map(([t, a]) => `${a.length}x "${t.slice(0, 50)}": ${a.slice(0, 3).join(' ')}`));
sec('Under 300 visible words', rows.filter((r) => r.words < 300).sort((a, b) => a.words - b.words).map((r) => `${r.words} ${r.u}`));
sec('Slow (over 1500 ms)', rows.filter((r) => r.ms > 1500).sort((a, b) => b.ms - a.ms).map((r) => `${r.ms} ${r.u}`));
