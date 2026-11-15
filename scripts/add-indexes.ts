// scripts/add-indexes.ts — add missing indexes to reduce D1 rows_read
// Run once: npx tsx scripts/add-indexes.ts
// Indexes on (status, primary_trigger) and (status) cut per-query scan from full-table to indexed range.
// LIKE '%x%' can't use an index on intents, but status+intents composite still helps filter.

import 'dotenv/config';
import { getDb } from './lib/db.js';

const db = getDb();

const indexes = [
  // Most-queried: WHERE status='published' AND primary_trigger=?  ORDER BY view_count DESC
  // Also covers COUNT(*) queries on (status, primary_trigger) — idx_videos_status_trigger is redundant
  `CREATE INDEX IF NOT EXISTS idx_videos_status_trigger_views
   ON videos(status, primary_trigger, view_count DESC)`,

  // status-only filter (INTENT_HUB LIKE scans, TRIGGER_HUB counts)
  `CREATE INDEX IF NOT EXISTS idx_videos_status
   ON videos(status)`,

  // FORMAT_HUB: WHERE status='published' ORDER BY view_count DESC LIMIT 30
  `CREATE INDEX IF NOT EXISTS idx_videos_status_views
   ON videos(status, view_count DESC)`,

  // Related-videos lookup (video pages): drive from the pair table instead of scanning videos.
  `CREATE INDEX IF NOT EXISTS idx_tup_trigger_intent_video
   ON trigger_usecase_pairs(trigger_slug, intent_slug, video_id)`,
];

let failed = 0;
for (const sql of indexes) {
  const name = sql.match(/idx_\w+/)?.[0] ?? sql.slice(0, 40);
  try {
    await db.execute(sql);
    console.log(`✅ ${name}`);
  } catch (e: any) {
    console.error(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

console.log('\nDone. Indexes reduce rows_read on every published-video query.');
if (failed > 0) process.exit(1);
