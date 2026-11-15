#!/usr/bin/env node
// Read-only Google Search Console audit. Runs in GitHub Actions (.github/workflows/gsc-audit.yml) because the OAuth
// secrets live there. Prints: properties, sitemaps (submitted vs indexed), weekly clicks/impressions for 16 months,
// top pages and queries for the last 28 days, and URL Inspection for key pages. Never prints tokens.
const { GSC_CLIENT_ID: id, GSC_CLIENT_SECRET: secret, GSC_REFRESH_TOKEN: refresh } = process.env;
const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }),
})).json();
if (!tok.access_token) { console.log('TOKEN FAIL:', tok.error, tok.error_description); process.exit(1); }
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
const get = (u) => fetch(u, { headers: H }).then((r) => r.json());
const post = (u, b) => fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) }).then((r) => r.json());
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const sites = await get('https://www.googleapis.com/webmasters/v3/sites');
console.log('=== Properties ===');
for (const s of sites.siteEntry || []) console.log(s.siteUrl, s.permissionLevel);
const SITE = (sites.siteEntry || []).map((s) => s.siteUrl).find((u) => u.includes('asmrregistry')) || 'sc-domain:asmrregistry.com';
const E = encodeURIComponent(SITE);
console.log('using', SITE);

console.log('\n=== Sitemaps ===');
const sm = await get(`https://www.googleapis.com/webmasters/v3/sites/${E}/sitemaps`);
for (const s of sm.sitemap || []) {
  const c = (s.contents || []).reduce((a, x) => [a[0] + Number(x.submitted || 0), a[1] + Number(x.indexed || 0)], [0, 0]);
  console.log(`${s.path} submitted=${c[0]} indexed=${c[1]} lastDownloaded=${s.lastDownloaded || 'never'} errors=${s.errors || 0} warnings=${s.warnings || 0} pending=${s.isPending}`);
}

const sa = (body) => post(`https://www.googleapis.com/webmasters/v3/sites/${E}/searchAnalytics/query`, body);
console.log('\n=== Weekly clicks / impressions / avg position (16 months) ===');
const byDate = await sa({ startDate: day(480), endDate: day(2), dimensions: ['date'], rowLimit: 600 });
const weeks = {};
for (const r of byDate.rows || []) { const d = new Date(r.keys[0]); const wk = new Date(d - d.getUTCDay() * 864e5).toISOString().slice(0, 10); const w = (weeks[wk] ||= [0, 0, 0]); w[0] += r.clicks; w[1] += r.impressions; w[2] += r.position * r.impressions; }
for (const [wk, [c, i, p]] of Object.entries(weeks).sort()) console.log(wk, 'clicks', c, 'impr', i, 'pos', i ? (p / i).toFixed(1) : '-');
if (byDate.error) console.log('error', JSON.stringify(byDate.error).slice(0, 200));

console.log('\n=== Top pages, last 28 days ===');
for (const r of (await sa({ startDate: day(30), endDate: day(2), dimensions: ['page'], rowLimit: 25 })).rows || []) console.log(r.clicks, r.impressions, r.position.toFixed(1), r.keys[0]);
console.log('\n=== Top queries, last 28 days ===');
for (const r of (await sa({ startDate: day(30), endDate: day(2), dimensions: ['query'], rowLimit: 25 })).rows || []) console.log(r.clicks, r.impressions, r.position.toFixed(1), r.keys[0]);
console.log('\n=== Top pages, Aug 1 to 31 2026 (before the drop) ===');
for (const r of (await sa({ startDate: '2026-08-01', endDate: '2026-08-31', dimensions: ['page'], rowLimit: 15 })).rows || []) console.log(r.clicks, r.impressions, r.position.toFixed(1), r.keys[0]);

console.log('\n=== URL Inspection ===');
for (const path of ['/', '/sleep/', '/tapping/', '/guides/what-is-asmr/', '/asmr-videos/', '/creators/asmr-gibi/', '/guides/white-noise/']) {
  const r = await post('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: `https://asmrregistry.com${path}`, siteUrl: SITE });
  const x = r.inspectionResult?.indexStatusResult;
  console.log(path, '|', x ? [x.verdict, x.coverageState, 'crawled ' + (x.lastCrawlTime || 'never'), 'canonical ' + (x.googleCanonical || '-'), x.robotsTxtState, x.indexingState].join(' | ') : JSON.stringify(r.error || r).slice(0, 160));
}
