// cron-worker/src/stages/dead-check.ts
// YouTube API Developer Policies III.E.4.c: stored API data must be refreshed or deleted within 30 calendar days.
// Each run refreshes the DEAD_CHECK least-recently synced published and draft videos (about 60K, so a full cycle
// takes ~15 days at 8 runs a day): title, channel name, length and views. Removed videos are marked deleted with a
// removed_at date. Rejected and deleted rows keep only the ID (allowed indefinitely) and our own labels: their
// YouTube fields are cleared. It also deletes intake-queue rows older than 30 days.
// Cost per run: 1 select (scans the published set, ~45K reads, no index on purpose: reads are cheap on the free tier,
// an extra index would add a write to every refresh), DEAD_CHECK/50 YouTube calls and D1 batches, 1 purge.
import type { Client } from '../d1-adapter';
import { DEAD_CHECK, QUEUE_PURGE } from '../constants';
import { getVideoDetails, parseDuration } from '../lib/youtube';

export async function runDeadCheck(db: Client, apiKey: string): Promise<{ checked: number; dead: number }> {
  // Intake rows hold titles, descriptions and view counts fetched from YouTube; past 30 days they must go.
  // Runs first (2026-11-13): at the end it ran 14 times in a week instead of ~56, because an earlier failure skipped it,
  // and ~45K rows were left past 30 days.
  await db.execute({
    sql: `DELETE FROM ingest_queue WHERE id IN (SELECT id FROM ingest_queue WHERE queued_at < datetime('now', '-30 days') LIMIT ?)`,
    args: [QUEUE_PURGE],
  });

  const videos = await db.execute({
    sql: `SELECT id FROM videos WHERE status IN ('published', 'draft') ORDER BY last_synchronized ASC LIMIT ?`,
    args: [DEAD_CHECK],
  });

  let dead = 0;
  for (let i = 0; i < videos.rows.length; i += 50) {
    const batch = videos.rows.slice(i, i + 50);
    const ids = batch.map(r => r.id as string);
    // Throws on any API error (quota, outage): nothing is marked deleted on a failed call.
    const result = await getVideoDetails(apiKey, ids);
    const byId = new Map(result.items.map(item => [item.id, item]));

    // All per-row writes for this chunk go in one batch (1 subrequest).
    const stmts: { sql: string; args: any[] }[] = [];
    for (const id of ids) {
      const v = byId.get(id);
      if (!v) {
        stmts.push({ sql: `UPDATE videos SET status = 'deleted', removed_at = datetime('now') WHERE id = ?`, args: [id] });
        stmts.push({ sql: `DELETE FROM trigger_usecase_pairs WHERE video_id = ?`, args: [id] });
        dead++;
        continue;
      }
      const secs = parseDuration(v.contentDetails?.duration);
      stmts.push({
        // Keep the old length when YouTube reports 0 (live or premiere placeholders) so a real length is never erased.
        sql: `UPDATE videos SET last_synchronized = datetime('now'), view_count = ?, title = ?, channel_name = ?,
                duration_seconds = CASE WHEN ? > 0 THEN ? ELSE duration_seconds END WHERE id = ?`,
        args: [parseInt(v.statistics?.viewCount || '0'), v.snippet.title, v.snippet.channelTitle, secs, secs, id],
      });
    }
    if (stmts.length > 0) await db.batch(stmts, 'write');
  }

  // Rejected and deleted rows are never refreshed, so their YouTube fields go (the ID and our labels stay).
  // Once a day (the 07:00 run): the subquery scans the table, ~68K reads, and new rejected rows are well under 2,500 a day.
  if (new Date().getUTCHours() === 7) await db.execute({
    sql: `UPDATE videos SET title = '', channel_name = NULL, creator_name = NULL, description = NULL, view_count = 0,
            duration_seconds = -1, publish_date = NULL
          WHERE id IN (SELECT id FROM videos WHERE status IN ('rejected', 'deleted') AND title != '' LIMIT ?)`,
    args: [QUEUE_PURGE],
  });

  return { checked: videos.rows.length, dead };
}
