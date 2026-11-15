#!/usr/bin/env node
// Fails (red GitHub run, which emails the owner) when yesterday's D1 rows read passed 80% of the 5M free daily limit.
// Usage: node tools/d1-read-alarm.mjs   Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
const LIMIT = 5_000_000, WARN = 0.8;
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
const day = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const query = `{viewer{accounts(filter:{accountTag:"${account}"}){d1AnalyticsAdaptiveGroups(limit:10,filter:{date:"${day}"}){sum{rowsRead}}}}}`;
const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
});
const j = await r.json();
const groups = j.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
if (!groups) { console.log(`::warning::d1-read-alarm: no analytics (${JSON.stringify(j.errors).slice(0, 150)})`); process.exit(0); }
const rows = groups.reduce((n, g) => n + g.sum.rowsRead, 0);
console.log(`D1 rows read on ${day}: ${rows.toLocaleString('en-US')} of ${LIMIT.toLocaleString('en-US')} free`);
if (rows > LIMIT * WARN) { console.log(`::error::D1 reads at ${Math.round(100 * rows / LIMIT)}% of the free limit on ${day}`); process.exitCode = 1; }
