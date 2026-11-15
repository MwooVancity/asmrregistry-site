// tools/backfill-duration.ts — Fetch real duration + view_count for videos that were
// ingested via search.list (which omits contentDetails/statistics) and therefore have
// duration_seconds = 0. Converts unverified drafts into publish-eligible inventory.
//
//   npx tsx tools/backfill-duration.ts [--limit N] [--dry-run]
//
// Cost: videos.list = 1 unit per 50 ids. 3,600 rows ≈ 72 units. Cheap.
// After this, drafts with confirmed duration >=300s + a trigger become VE2-eligible.

import 'dotenv/config';
import { getVideoDetails, parseDuration } from '../scripts/lib/youtube.js';
import { getDb } from '../scripts/lib/db.js';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) { console.error('Missing YOUTUBE_API_KEY in .env'); process.exit(1); }

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitFlag = args.indexOf('--limit');
const limit = limitFlag >= 0 ? parseInt(args[limitFlag + 1]) : 100000;

async function main() {
  const db = getDb();

  const rows = await db.execute({
    sql: `SELECT id FROM videos
          WHERE (duration_seconds IS NULL OR duration_seconds = 0)
          ORDER BY rowid ASC LIMIT ?`,
    args: [limit],
  });

  const ids = rows.rows.map(r => r.id as string);
  console.log(`Duration backfill: ${ids.length} videos with unknown duration (dry-run=${dryRun})`);
  if (ids.length === 0) { console.log('Nothing to backfill.'); process.exit(0); }

  let updated = 0, missing = 0, units = 0;
  const startTime = Date.now();

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    let details;
    try {
      details = await getVideoDetails(YOUTUBE_API_KEY!, batch);
      units++;
    } catch (err) {
      const s = String(err);
      if (s.includes('403') && s.includes('quota')) { console.error(`Quota exceeded after ${units} calls. Stopping.`); break; }
      console.warn(`Batch ${i / 50} failed: ${s.slice(0, 120)}`);
      continue;
    }

    const found = new Set(details.items.map(v => v.id));
    const stmts: Array<{ sql: string; args: any[] }> = [];

    for (const v of details.items) {
      const dur = parseDuration(v.contentDetails?.duration);
      const views = parseInt(v.statistics?.viewCount || '0');
      stmts.push({
        sql: `UPDATE videos SET duration_seconds = ?, view_count = ? WHERE id = ?`,
        args: [dur, views, v.id],
      });
    }

    // Videos no longer available on YouTube (deleted/private) — mark rejected so they never publish.
    for (const id of batch) {
      if (!found.has(id)) {
        missing++;
        stmts.push({
          sql: `UPDATE videos SET status = 'rejected', duration_seconds = -1 WHERE id = ? AND status != 'published'`,
          args: [id],
        });
      }
    }

    if (!dryRun && stmts.length > 0) await db.batch(stmts, 'write');
    updated += details.items.length;

    if ((i / 50) % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(`  ${i + batch.length}/${ids.length} — updated=${updated} missing=${missing} units=${units} (${elapsed}s)`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${missing} unavailable, ${units} API units used${dryRun ? ' (DRY RUN)' : ''}`);

  if (!dryRun) {
    const s = await db.execute(`SELECT
      (SELECT COUNT(*) FROM videos WHERE status='draft' AND confidence>=0.7 AND is_asmr=1 AND duration_seconds>=300 AND primary_trigger IS NOT NULL AND primary_trigger!='') as promotable,
      (SELECT COUNT(*) FROM videos WHERE duration_seconds IS NULL OR duration_seconds=0) as still_unknown
    `);
    const r = s.rows[0];
    console.log(`Now promotable (VE2-eligible drafts): ${r.promotable}; still-unknown duration: ${r.still_unknown}`);
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
