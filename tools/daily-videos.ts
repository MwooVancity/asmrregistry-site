// tools/daily-videos.ts — the whole daily video pipeline in one command.
//
//   npx tsx tools/daily-videos.ts
//
// Cost: $0. Classification is keyword-only (no LLM). The only metered resource is
// YouTube API quota during ingest, and ingest is skipped entirely while the queue
// is already deep.
//
// No build or deploy step: src/pages/video/[id].astro and the sitemap routes are all
// `prerender = false`, so a row that flips to status='published' in Turso is live on
// the next request. Deploys are only needed for source changes (e.g. grind pages).

import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { getDb } from '../scripts/lib/db.js';

const PUBLISH_PER_DAY = 500;
const QUEUE_FLOOR = 50000;     // top up ingest only when pending drops below this
const CHANNELS_PER_TOPUP = 25;
const ENRICH_BATCH = PUBLISH_PER_DAY; // never fetch more than can be published: reads count against the free tier
const KEYWORD_INGEST_PAGES = 1; // 1 page × 40 queries = 40 YouTube search calls/day (under 100/day quota)

const QUOTA_RE = /"code":\s*7500|exceeded D1's free tier/;
function quotaStop(where: string): never {
  console.warn(`::warning::D1 free-tier daily read limit reached (${where}). Skipping today, resets 00:00 UTC. Exiting 0 so no failure email is sent.`);
  process.exit(0);
}

function run(script: string, args: string[]) {
  console.log(`\n$ npx tsx ${script} ${args.join(' ')}`);
  const r = spawnSync('npx', ['tsx', script, ...args], {
    stdio: ['inherit', 'inherit', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32', // npx resolves to npx.cmd on Windows
  });
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    if (QUOTA_RE.test(r.stderr ?? '')) quotaStop(script);
    console.error(`FAILED: ${script} exited with ${r.status}`);
    process.exit(1);
  }
}

const db = getDb();
let pending = 0;
try {
  pending = Number((await db.execute(`SELECT COUNT(*) as c FROM (SELECT 1 FROM ingest_queue WHERE processing_status='pending' LIMIT ${QUEUE_FLOOR + 1})`)).rows[0]?.c ?? 0);
} catch (e: any) {
  if (QUOTA_RE.test(String(e?.message))) quotaStop('queue count');
  throw e;
}
console.log(`Queue: ${pending} pending rows.`);

// Always run keyword search ingest (40 calls/day, stays under quota)
run('tools/keyword-ingest.ts', ['--pages', String(KEYWORD_INGEST_PAGES)]);

if (pending < QUEUE_FLOOR) {
  run('tools/backfill-ingest.ts', ['--channels', String(CHANNELS_PER_TOPUP)]);
} else {
  console.log(`Above floor of ${QUEUE_FLOOR} — skipping channel ingest to save YouTube quota.`);
}

run('tools/backfill-enrich.ts', ['--batch', String(ENRICH_BATCH), '--publish-cap', String(PUBLISH_PER_DAY)]);

console.log('\nDone. Video pages and sitemaps are SSR — published rows are already live.');
