import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../velocity-engine/.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const tok = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: env.GSC_CLIENT_ID, client_secret: env.GSC_CLIENT_SECRET, refresh_token: env.GSC_REFRESH_TOKEN, grant_type: 'refresh_token' }) })).json();
const T = tok.access_token;
const SITE = 'sc-domain:asmrregistry.com';
const urls = ['https://asmrregistry.com/', 'https://asmrregistry.com/sleep/', 'https://asmrregistry.com/video/gVKEM4K8J8A/'];
for (const u of urls) {
  const r = await (await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST', headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: u, siteUrl: SITE }) })).json();
  const i = r.inspectionResult?.indexStatusResult;
  console.log(`\n=== ${u} ===`);
  if (!i) { console.log(JSON.stringify(r).slice(0, 400)); continue; }
  console.log(`verdict:        ${i.verdict}`);
  console.log(`coverageState:  ${i.coverageState}`);
  console.log(`robotsTxtState: ${i.robotsTxtState}`);
  console.log(`indexingState:  ${i.indexingState}`);
  console.log(`pageFetchState: ${i.pageFetchState}`);
  console.log(`lastCrawlTime:  ${i.lastCrawlTime || 'NEVER CRAWLED'}`);
  console.log(`googleCanonical: ${i.googleCanonical || '-'}`);
  console.log(`userCanonical:   ${i.userCanonical || '-'}`);
}
process.exit(0);
