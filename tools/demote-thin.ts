// tools/demote-thin.ts — Reverse the unsafe batch promotion. Demote thin/unverified
// published videos back to draft so VE2 can re-drip them honestly.
//
//   npx tsx tools/demote-thin.ts [--dry-run]
//
// KEEP published: confirmed real duration (>=300s) AND a primary_trigger.
// DEMOTE to draft: everything else (unknown duration, or no trigger).
// Also clears trigger_usecase_pairs for demoted videos to keep matrix counts honest.

import 'dotenv/config';
import { getDb } from '../scripts/lib/db.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const db = getDb();

  const before = await db.execute(`SELECT
    (SELECT COUNT(*) FROM videos WHERE status='published') as published,
    (SELECT COUNT(*) FROM videos WHERE status='published' AND duration_seconds>=300 AND primary_trigger IS NOT NULL AND primary_trigger!='') as keep,
    (SELECT COUNT(*) FROM videos WHERE status='published' AND NOT (duration_seconds>=300 AND primary_trigger IS NOT NULL AND primary_trigger!='')) as demote
  `);
  const b = before.rows[0];
  console.log(`Before: ${b.published} published → keep ${b.keep}, demote ${b.demote} (dry-run=${dryRun})`);

  if (dryRun) { process.exit(0); }

  // Clear matrix pairs for soon-to-be-draft videos
  await db.execute(`DELETE FROM trigger_usecase_pairs WHERE video_id IN (
    SELECT id FROM videos WHERE status='published'
      AND NOT (duration_seconds>=300 AND primary_trigger IS NOT NULL AND primary_trigger!='')
  )`);

  // Demote thin/unverified back to draft
  const res = await db.execute(`UPDATE videos SET status='draft'
    WHERE status='published'
      AND NOT (duration_seconds>=300 AND primary_trigger IS NOT NULL AND primary_trigger!='')`);

  const after = await db.execute(`SELECT
    (SELECT COUNT(*) FROM videos WHERE status='published') as published,
    (SELECT COUNT(*) FROM videos WHERE status='draft') as draft,
    (SELECT COUNT(DISTINCT trigger_slug||'/'||intent_slug) FROM trigger_usecase_pairs
       WHERE video_id IN (SELECT id FROM videos WHERE status='published')) as matrix_pages
  `);
  const a = after.rows[0];
  console.log(`Demoted ${res.rowsAffected} videos.`);
  console.log(`After: ${a.published} published, ${a.draft} draft, ${a.matrix_pages} matrix pages`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
