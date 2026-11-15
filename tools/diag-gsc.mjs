import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../velocity-engine/.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));

const tok = await (await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: env.GSC_CLIENT_ID, client_secret: env.GSC_CLIENT_SECRET, refresh_token: env.GSC_REFRESH_TOKEN, grant_type: 'refresh_token' }),
})).json();
const T = tok.access_token;
if (!T) { console.log('TOKEN FAIL', tok); process.exit(1); }
const g = (u) => fetch(u, { headers: { Authorization: `Bearer ${T}` } }).then(r => r.json());
const p = (u, b) => fetch(u, { method: 'POST', headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());

const SITE = 'sc-domain:asmrregistry.com';
const E = encodeURIComponent(SITE);

console.log('=== Properties on this account ===');
const sites = await g('https://www.googleapis.com/webmasters/v3/sites');
console.table((sites.siteEntry || []).map(s => ({ url: s.siteUrl, perm: s.permissionLevel })));

console.log('\n=== Sitemaps (submitted vs indexed) ===');
const sm = await g(`https://www.googleapis.com/webmasters/v3/sites/${E}/sitemaps`);
for (const s of sm.sitemap || []) {
  const c = (s.contents || []).reduce((a, x) => ({ submitted: a.submitted + Number(x.submitted || 0), indexed: a.indexed + Number(x.indexed || 0) }), { submitted: 0, indexed: 0 });
  console.log(`${s.path}  submitted=${c.submitted} indexed=${c.indexed}  lastDownloaded=${s.lastDownloaded || 'never'}  errors=${s.errors || 0} warnings=${s.warnings || 0} isPending=${s.isPending}`);
}
if (!(sm.sitemap || []).length) console.log('NO SITEMAPS or error:', JSON.stringify(sm).slice(0, 300));

const end = '2026-06-05', start = '2026-05-08';
console.log(`\n=== Search Analytics ${start}..${end} (totals) ===`);
const tot = await p(`https://www.googleapis.com/webmasters/v3/sites/${E}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: [] });
console.log(JSON.stringify(tot.rows || tot, null, 0).slice(0, 400));

console.log('\n=== By date ===');
const byd = await p(`https://www.googleapis.com/webmasters/v3/sites/${E}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: ['date'] });
console.table((byd.rows || []).map(r => ({ date: r.keys[0], clicks: r.clicks, impr: r.impressions, ctr: (r.ctr * 100).toFixed(1) + '%', pos: r.position.toFixed(1) })));

console.log('\n=== Top queries ===');
const q = await p(`https://www.googleapis.com/webmasters/v3/sites/${E}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: ['query'], rowLimit: 15 });
console.table((q.rows || []).map(r => ({ query: r.keys[0], clicks: r.clicks, impr: r.impressions, pos: r.position.toFixed(1) })));

console.log('\n=== Top pages ===');
const pg = await p(`https://www.googleapis.com/webmasters/v3/sites/${E}/searchAnalytics/query`, { startDate: start, endDate: end, dimensions: ['page'], rowLimit: 15 });
console.table((pg.rows || []).map(r => ({ page: r.keys[0].replace('https://asmrregistry.com', ''), clicks: r.clicks, impr: r.impressions, pos: r.position.toFixed(1) })));

process.exit(0);
