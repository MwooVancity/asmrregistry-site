// Sitemaps for engine-v2 creator pages and their video pages (public/creator-data/*.json), 45,000 URLs per file
// (the protocol allows 50,000). Writes public/sitemap-creators-<n>.xml and lists them in robots.txt. No network.
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
const DIR = 'public/creator-data', SITE = 'https://asmrregistry.com';
for (const f of readdirSync('public').filter((f) => /^sitemap-creators-\d+\.xml$/.test(f))) unlinkSync(`public/${f}`);
const urls = [];
const index = []; // compact creator index for "similar creators" (public/creator-index.json, ~150 bytes each)
if (existsSync(DIR)) for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  let d; try { d = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')); } catch { continue; } // half-written file: skip
  if (!d?.channel?.title || !d.counts || !d.lengths || !Array.isArray(d.all) || !(Date.parse(d.fetched) > 0)) { console.warn(`prebuild-creator-sitemap: skipped malformed ${f}`); continue; }
  if (Date.now() - Date.parse(d.fetched) > 30 * 864e5) continue; // pages for stale data 410
  const slug = f.slice(0, -5);
  urls.push([`/creators/${slug}/`, d.fetched]);
  index.push({ s: slug, t: d.channel.title, n: d.counts.public, m: d.lengths.medianMin, sub: d.channel.subs, tr: (d.triggers || []).slice(0, 5).map(([k, c]) => [k, Math.round((100 * c) / Math.max(d.counts.full, 1))]) });
  // Per-video pages left out (2026-11-18): crawling ~290K of them used up the Cloudflare account's free 100K
  // requests/day and took riverwaterlevels (main income site) down. robots.txt also disallows them. Re-add only
  // after asmrregistry has its own request budget (paid Workers plan or its own Cloudflare account).
}
writeFileSync('public/creator-index.json', JSON.stringify(index));
const files = [];
for (let i = 0; i < urls.length; i += 45000) {
  const name = `sitemap-creators-${files.length + 1}.xml`;
  writeFileSync(`public/${name}`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.slice(i, i + 45000).map(([u, d]) => `<url><loc>${SITE}${u}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  files.push(name);
}
const robots = readFileSync('public/robots.txt', 'utf8').split(/\r?\n/).filter((l) => !/sitemap-creators-\d+\.xml/.test(l));
writeFileSync('public/robots.txt', [...robots.filter((l, i, a) => !(l === '' && i === a.length - 1)), ...files.map((f) => `Sitemap: ${SITE}/${f}`), ''].join('\n'));
console.log(`prebuild-creator-sitemap: ${urls.length} URLs in ${files.length} file(s)`);
