// tools/gsc-weekly.mjs — weekly GSC telemetry: classify every URL WIN/CLOSE/DEAD/NEW.
// DEAD pages feed the prune-audit kill chain. Run: node tools/gsc-weekly.mjs
// Auth: service account (GSC_SERVICE_ACCOUNT_JSON in velocity-engine/.env)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { getGSCAccessToken, timedFetch } from './lib/gsc-auth.mjs';
import { classifyPage } from './gsc-classify.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'sc-domain:asmrregistry.com';

let token;
try {
  token = await getGSCAccessToken();
} catch (e) {
  console.error(`✗ GSC auth failed: ${e.message}`);
  console.error('  Fix: add velocity-engine@asmr-directory-497009.iam.gserviceaccount.com as Full user in GSC → Settings → Users and permissions');
  process.exit(1);
}

const end = new Date().toISOString().split('T')[0];
const start = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];

async function query(dimensions, extra = {}) {
  const res = await timedFetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions, rowLimit: 5000, ...extra }),
    },
  );
  if (res.status === 403 || res.status === 401) {
    console.error(`✗ HTTP ${res.status}: service account lacks GSC access.`);
    console.error(`  Fix: GSC → Settings → Users and permissions → Add velocity-engine@asmr-directory-497009.iam.gserviceaccount.com with Full permissions on ${SITE}`);
    process.exit(1);
  }
  return res.json();
}

const pageData = await query(['page']);
const rows = (pageData.rows || []).map(r => ({
  page: r.keys[0].replace('https://asmrregistry.com', ''),
  clicks: r.clicks, impressions: r.impressions, position: r.position,
  verdict: classifyPage({ clicks: r.clicks, impressions: r.impressions, position: r.position }),
}));

const buckets = { WIN: [], CLOSE: [], DEAD: [], NEW: [] };
for (const r of rows) buckets[r.verdict].push(r);

// Write state file for other tools
const stateFile = join(ROOT, 'state/gsc-coverage.json');
writeFileSync(stateFile, JSON.stringify({ generatedAt: new Date().toISOString(), start, end, rows }, null, 2));
console.log(`✓ Written ${stateFile}`);

console.log(`\n=== GSC ${start}..${end} — ${rows.length} URLs ===`);
for (const v of ['WIN', 'CLOSE', 'DEAD']) {
  console.log(`\n--- ${v} (${buckets[v].length}) ---`);
  console.table(buckets[v]
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25)
    .map(r => ({ page: r.page, clicks: r.clicks, impr: r.impressions, pos: r.position.toFixed(1) })));
}
console.log(`\nNEW (insufficient data): ${buckets.NEW.length} URLs`);
console.log(`\nKill-chain input: ${buckets.DEAD.length} DEAD URLs → review against prune-audit before any pruning.`);
process.exit(0);
