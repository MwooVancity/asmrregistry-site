#!/usr/bin/env node
// Internal link audit of the live site. Crawls every URL in sitemap-pages.xml plus the home page, then reports:
// broken internal links, links that pass through redirects, links to noindex pages (excluding /video/), orphans
// (no in-content links from other pages), click depth from the home page, and pages with few in-content links.
// "In-content" excludes the header, nav and footer, which repeat on every page.
// Cost: ~420 page fetches plus one request per unique link target. Read-only.
// Usage: node tools/link-audit.mjs [--list]
const SITE = 'https://asmrregistry.com';
const LIST = process.argv.includes('--list');
const get = async (u, method = 'GET') => {
  try { const r = await fetch(u, { method, redirect: 'manual' }); return { status: r.status, loc: r.headers.get('location'), html: method === 'GET' ? await r.text() : '' }; }
  catch (e) { return { status: 0, loc: null, html: '' }; }
};
const norm = (href) => {
  if (!href || /^(mailto:|tel:|javascript:|#)/.test(href)) return null;
  let u; try { u = new URL(href, SITE); } catch { return null; }
  if (u.host !== 'asmrregistry.com' || u.pathname.startsWith('/go/')) return null; // /go/ is the Amazon fallback, robots-blocked
  let p = u.pathname; if (!/\.[a-z0-9]+$/i.test(p) && !p.endsWith('/')) p += '/';
  return p;
};
// Script blocks build links in code ('<a href="' + x + '">'); those are not links in the page, so drop them first.
const linksIn = (html) => [...html.replace(/<script[\s\S]*?<\/script>/gi, '').matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => norm(m[1].replace(/&amp;/g, '&'))).filter(Boolean);
const body = (html) => html.replace(/<header[\s\S]*?<\/header>/gi, '').replace(/<nav[\s\S]*?<\/nav>/gi, '').replace(/<footer[\s\S]*?<\/footer>/gi, '');
async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } })); return out; }

const sm = await get(SITE + '/sitemap-pages.xml');
const pages = ['/', ...[...sm.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname)];
const uniq = [...new Set(pages)];
const fetched = await pool(uniq, 8, (p) => get(SITE + p));
const allLinks = {}, contentLinks = {}, noindex = new Set();
uniq.forEach((p, i) => {
  const h = fetched[i].html;
  if (/<meta name="robots" content="[^"]*noindex/.test(h)) noindex.add(p);
  allLinks[p] = [...new Set(linksIn(h))];
  contentLinks[p] = [...new Set(linksIn(body(h)))].filter((t) => t !== p);
});
const targets = [...new Set(Object.values(allLinks).flat())].filter((t) => !t.startsWith('/video/') && !uniq.includes(t));
const tstat = Object.fromEntries((await pool(targets, 8, async (t) => [t, await get(SITE + t, 'HEAD')])));
uniq.forEach((p, i) => (tstat[p] = fetched[i]));
const videoTargets = [...new Set(Object.values(allLinks).flat().filter((t) => t.startsWith('/video/')))];

const broken = [], redirects = [], toNoindex = [];
for (const [p, ls] of Object.entries(allLinks)) for (const t of ls) {
  const s = tstat[t]; if (!s) continue;
  if (s.status >= 400 || s.status === 0) broken.push(`${p} -> ${t} (${s.status})`);
  else if (s.status >= 300) redirects.push(`${p} -> ${t} -> ${s.loc}`);
  else if (noindex.has(t)) toNoindex.push(`${p} -> ${t}`);
}
const inbound = Object.fromEntries(uniq.map((p) => [p, 0]));
for (const [p, ls] of Object.entries(contentLinks)) for (const t of ls) if (t in inbound) inbound[t]++;
const orphans = uniq.filter((p) => p !== '/' && inbound[p] === 0);
const weak = uniq.filter((p) => p !== '/' && inbound[p] > 0 && inbound[p] < 3);
const depth = { '/': 0 }, q = ['/'];
while (q.length) { const p = q.shift(); for (const t of allLinks[p] || []) if (t in inbound && depth[t] === undefined) { depth[t] = depth[p] + 1; q.push(t); } }
const unreachable = uniq.filter((p) => depth[p] === undefined);
const deep = uniq.filter((p) => depth[p] > 3);
const outCounts = uniq.map((p) => contentLinks[p].filter((t) => !t.startsWith('/video/')).length);
const dist = {}; for (const p of uniq) if (depth[p] !== undefined) dist[depth[p]] = (dist[depth[p]] || 0) + 1;

const sec = (name, arr) => { console.log(`\n## ${name}: ${arr.length}`); if (arr.length) console.log((LIST ? arr : arr.slice(0, 12)).join('\n') + (!LIST && arr.length > 12 ? `\n... ${arr.length - 12} more (--list)` : '')); };
console.log(`pages crawled ${uniq.length} | non-video link targets checked ${targets.length} | /video/ pages linked ${videoTargets.length} | noindex pages in sitemap ${[...noindex].filter((p) => uniq.includes(p)).length}`);
console.log(`click depth from home: ${JSON.stringify(dist)} | in-content internal links per page: median ${outCounts.sort((a, b) => a - b)[Math.floor(outCounts.length / 2)]}, min ${outCounts[0]}, max ${outCounts[outCounts.length - 1]}`);
sec('Broken internal links', broken);
sec('Links through a redirect', redirects);
sec('Links to noindex pages (not /video/)', toNoindex);
sec('Orphans (no in-content link from any page; nav or footer only)', orphans);
sec('Weak (1-2 in-content inbound links)', weak.map((p) => `${p} (${inbound[p]})`));
sec('Unreachable from home by any link', unreachable);
sec('Deeper than 3 clicks', deep.map((p) => `${p} (${depth[p]})`));
