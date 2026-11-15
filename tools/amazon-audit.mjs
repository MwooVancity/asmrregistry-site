#!/usr/bin/env node
// Live check of every sitemap page: ad present, disclosure present, NO direct Amazon URL in the HTML (bots scrape
// those), and every Amazon link is a sponsored /go/ link. Also proves /go/ carries the tag and does not redirect.
// Usage: node tools/amazon-audit.mjs
const SITE = 'https://asmrregistry.com', TAG = 'tag=220a102-20';
const get = async (u) => { for (let t = 0; t < 3; t++) { const r = await fetch(u, { redirect: 'manual' }).catch(() => null); if (r) return r; } return null; };
const xml = await (await fetch(`${SITE}/sitemap-pages.xml`)).text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const bad = []; let links = 0;
const check = async (u) => {
  const r = await get(u);
  if (!r) { bad.push(`${u} unreachable`); return; }
  if (r.status !== 200) { bad.push(`${u} status ${r.status}`); return; }
  const h = await r.text();
  if (!h.includes('class="ear-ad')) bad.push(`${u} no ad`);
  if (!h.includes('as an Amazon Associate')) bad.push(`${u} no disclosure`);
  if (/href="https:\/\/www\.amazon\./.test(h)) bad.push(`${u} direct Amazon URL in HTML`);
  for (const [a] of h.matchAll(/<a [^>]*data-amz=[^>]*>/g)) {
    links++;
    if (!a.includes('href="/go/?')) bad.push(`${u} bad href: ${a.slice(0, 80)}`);
    if (!a.includes('sponsored')) bad.push(`${u} not sponsored: ${a.slice(0, 80)}`);
  }
};
for (let i = 0; i < urls.length; i += 8) await Promise.all(urls.slice(i, i + 8).map(check));
const go = await get(`${SITE}/go/?q=wired%20earbuds`);
const goHtml = go ? await go.text() : '';
if (!go || go.status !== 200) bad.push(`/go/ status ${go && go.status} (must be 200, never a redirect)`);
if (!goHtml.includes(TAG)) bad.push('/go/ link missing tag');
if (!goHtml.includes('noindex')) bad.push('/go/ not noindex');
const empty = await get(`${SITE}/go/`);
if (empty && empty.status === 200) bad.push('/go/ with no query should not be a page');
console.log(`amazon-audit: ${urls.length} pages, ${links} Amazon links, ${bad.length} failures`);
bad.slice(0, 25).forEach(b => console.log('FAIL', b));
process.exit(bad.length ? 1 : 0);
