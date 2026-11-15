#!/usr/bin/env node
// Read-only live audit: does every published page resolve at its canonical URL, and does the
// sitemap agree? Exit 1 if a published page redirects/404s or the sitemap lists a non-200 URL.
// Usage: node tools/route-audit.mjs
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://asmrregistry.com';
const content = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-page-content.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-keyword-ledger.json'), 'utf8'));
const targetOf = {};
for (const p of ledger.pages) targetOf[p.slug] = p.targetUrl;

const published = Object.keys(content).filter(s => content[s].status === 'published');
const sitemapXml = await (await fetch(`${SITE}/sitemap-pages.xml`)).text();
const inSitemap = new Set([...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(SITE, '')));

async function probe(path) {
  const r = await fetch(SITE + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  return { status: r.status, location: r.headers.get('location') || '' };
}
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const rows = await pool(published, 8, async slug => {
  const path = targetOf[slug] || `/${slug}/`;
  const r = await probe(path).catch(e => ({ status: 0, location: String(e.message) }));
  return { slug, path, ...r, listed: inSitemap.has(path) };
});

const redirected = rows.filter(r => r.status >= 300 && r.status < 400);
const broken = rows.filter(r => r.status === 0 || r.status >= 400);
const unlisted = rows.filter(r => r.status === 200 && !r.listed);
const known = new Map(rows.map(r => [r.path, r.status]));
const extra = [...inSitemap].filter(p => !known.has(p));
const extraRows = await pool(extra, 8, async p => ({ p, ...(await probe(p).catch(() => ({ status: 0 }))) }));
extraRows.forEach(r => known.set(r.p, r.status));
const listedNon200 = [...inSitemap].filter(p => known.get(p) !== 200);

console.log(`published: ${published.length} | 200: ${rows.filter(r => r.status === 200).length} | redirected: ${redirected.length} | broken: ${broken.length} | 200 but not in sitemap: ${unlisted.length} | in sitemap but not 200 among published: ${listedNon200.length}`);
redirected.forEach(r => console.log(`  REDIRECT ${r.slug} ${r.path} -> ${r.location} (${r.status})${r.listed ? ' [IN SITEMAP]' : ''}`));
broken.forEach(r => console.log(`  BROKEN   ${r.slug} ${r.path} ${r.status} ${r.location}`));
unlisted.slice(0, 15).forEach(r => console.log(`  UNLISTED ${r.slug} ${r.path}`));
listedNon200.slice(0, 15).forEach(p => console.log(`  SITEMAP-NON200 ${p}`));
process.exit(redirected.length || broken.length || listedNon200.length ? 1 : 0);
