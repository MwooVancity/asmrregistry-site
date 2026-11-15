// tools/backfill-enrich.ts — Enrich pending ingest_queue rows at local scale.
//
//   npx tsx tools/backfill-enrich.ts [--batch N] [--concurrency N] [--publish-cap N] [--dry-run]
//
// Default: batch=500, concurrency=5, publish-cap=50/day.
// Classification is keyword-only (scripts/lib/keyword-classify.ts): no network calls,
// no API key, $0 per row. Quality is held by the publish gate below — confidence
// >= 0.7 AND is_asmr AND triggers AND intents — not by the classifier being clever.

import 'dotenv/config';
import { getDb } from '../scripts/lib/db.js';
import { validateEnrichment, matchTriggers, bucketFromSeconds } from '../scripts/lib/enrichment.js';
import { classifyByKeyword } from '../scripts/lib/keyword-classify.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const batchFlag = args.indexOf('--batch');
const batchSize = batchFlag >= 0 ? parseInt(args[batchFlag + 1]) : 500;
const concurrencyFlag = args.indexOf('--concurrency');
const concurrency = concurrencyFlag >= 0 ? parseInt(args[concurrencyFlag + 1]) : 5;
const capFlag = args.indexOf('--publish-cap');
const publishCapArg = capFlag >= 0 ? parseInt(args[capFlag + 1]) : 50;

async function main() {
  const db = getDb();

  // Reclaim stale enriching rows
  await db.execute(`UPDATE ingest_queue SET processing_status = 'pending' WHERE processing_status = 'enriching' AND queued_at < datetime('now', '-1 hour')`);

  // No ORDER BY: sorting the ~218K pending rows read ~428K rows per run, 9 runs a day (3.85M of the 5M free reads).
  // Without it SQLite stops at the LIMIT. ASMR-named channels first, anything else only once those run out.
  // Uploads from the last 30 days go first (index idx_queue_status_pub, reads only those rows): otherwise a creator's
  // new video waits behind 100K+ older ones and is purged at 30 days (Zach Choi's newest in the catalog was August).
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19) + 'Z';
  // --channel <id>: enrich only that creator's queued videos (one creator at a time, owner 2026-11-15).
  const oneCh = args.indexOf('--channel') >= 0 ? args[args.indexOf('--channel') + 1] : null;
  const fresh = oneCh
    ? await db.execute({ sql: `SELECT * FROM ingest_queue WHERE processing_status = 'pending' AND raw_channel_id = ? LIMIT ?`, args: [oneCh, batchSize] })
    : await db.execute({
    sql: `SELECT * FROM ingest_queue WHERE processing_status = 'pending' AND raw_publish_date >= ? ORDER BY raw_publish_date DESC LIMIT ?`,
    args: [since, batchSize],
  });
  let pending = await db.execute({
    sql: `SELECT * FROM ingest_queue WHERE processing_status = 'pending' AND raw_channel_name LIKE '%asmr%' LIMIT ?`,
    args: [batchSize],
  });
  if (pending.rows.length === 0) {
    pending = await db.execute({ sql: `SELECT * FROM ingest_queue WHERE processing_status = 'pending' LIMIT ?`, args: [batchSize] });
  }
  const seen = new Set(fresh.rows.map((r: any) => r.id));
  pending = oneCh ? fresh : { ...pending, rows: [...fresh.rows, ...pending.rows.filter((r: any) => !seen.has(r.id))].slice(0, batchSize) } as typeof pending;

  console.log(`Backfill enrich: ${pending.rows.length} pending rows (cap ${batchSize}), concurrency=${concurrency}, publish-cap=${publishCapArg}/day, dry-run=${dryRun}`);
  if (pending.rows.length === 0) { console.log('No pending rows.'); return; }

  // Count already-published today by created_at: the YouTube refresh (cron dead-check) bumps last_synchronized on
  // thousands of old videos a day, which filled this cap on 2026-11-04 and stopped publishing.
  const todayResult = await db.execute(
    `SELECT COUNT(*) as cnt FROM videos WHERE status='published' AND created_at >= datetime('now', 'start of day')`
  );
  let publishedToday = (todayResult.rows[0]?.cnt as number) ?? 0;
  const effectiveCap = publishCapArg;
  console.log(`Already published today: ${publishedToday}, daily cap: ${effectiveCap}`);

  let enriched = 0, published = 0, failed = 0, skippedShort = 0;
  const startTime = Date.now();

  // Process in chunks with concurrency limit
  for (let i = 0; i < pending.rows.length; i += concurrency) {
    // Stop at the cap instead of burning through the rest of the batch. Rows we
    // never touch stay processing_status='pending' and are reconsidered tomorrow,
    // rather than being marked 'draft' forever just because today was full.
    if (publishedToday >= effectiveCap) {
      console.log(`Publish cap ${effectiveCap} reached — ${pending.rows.length - i} rows left pending for tomorrow.`);
      break;
    }

    const chunk = pending.rows.slice(i, i + concurrency);

    await Promise.all(chunk.map(async (row) => {
      const id = row.id as string;

      // Reject shorts (under 5 minutes)
      const duration = row.raw_duration_seconds as number | null;
      if (duration !== null && duration > 0 && duration < 300) {
        if (!dryRun) {
          await db.execute({
            sql: `UPDATE ingest_queue SET processing_status = 'failed', failure_reason = 'too_short', processed_at = datetime('now') WHERE id = ?`,
            args: [id],
          });
        }
        skippedShort++;
        return;
      }

      try {
        const classified = classifyByKeyword({
          raw_title: row.raw_title as string,
          raw_channel_name: row.raw_channel_name as string | null,
          raw_duration_seconds: row.raw_duration_seconds as number | null,
          raw_description: row.raw_description as string | null,
        });

        const { valid, failureReason, normalized } = validateEnrichment(classified);

        if (!valid) {
          if (!dryRun) {
            await db.execute({
              sql: `UPDATE ingest_queue SET processing_status = 'failed', failure_reason = ?, processed_at = datetime('now') WHERE id = ?`,
              args: [failureReason!, id],
            });
          }
          failed++;
          return;
        }

        // Keyword-based trigger assignment (title + description for multi-trigger coverage)
        const keywordTriggers = matchTriggers(row.raw_title as string, (row.raw_description as string | null) ?? undefined);
        normalized.triggers = keywordTriggers;
        normalized.primary_trigger = keywordTriggers[0] ?? '';

        // Deterministic duration bucket
        const durSec = row.raw_duration_seconds as number | null;
        if (durSec !== null && durSec > 0) normalized.duration_bucket = bucketFromSeconds(durSec);

        // Publish decision — ENFORCE indexability gate
        // A video is indexable only if: confidence >= 0.7 AND is_asmr AND has triggers AND has intents AND has primary_trigger
        const isIndexable = normalized.intents.length > 0;
        const wouldPublish = normalized.confidence >= 0.7 && normalized.is_asmr && isIndexable;
        const status = (wouldPublish && publishedToday < effectiveCap) ? 'published' : (normalized.is_asmr ? 'draft' : 'rejected');
        if (wouldPublish && status === 'published') publishedToday++;

        if (!dryRun) {
          const statements: Array<{ sql: string; args: any[] }> = [
            {
              sql: `INSERT OR IGNORE INTO videos (id, title, channel_id, channel_name, duration_seconds, publish_date, view_count, primary_trigger, triggers, intents, intensity, language, format, modifiers, duration_bucket, roleplay_scenario, confidence, is_asmr, status, why_watch, created_at, last_synchronized)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), COALESCE(?, datetime('now')))`,
              // last_synchronized = when the YouTube data was fetched (queued_at), so the 30-day refresh clock starts there.
              args: [id, row.raw_title, row.raw_channel_id, row.raw_channel_name, row.raw_duration_seconds, row.raw_publish_date, row.raw_view_count, normalized.primary_trigger, JSON.stringify(normalized.triggers), JSON.stringify(normalized.intents), normalized.intensity, normalized.language, normalized.format, JSON.stringify(normalized.modifiers), normalized.duration_bucket, normalized.roleplay_scenario, normalized.confidence, normalized.is_asmr, status, normalized.why_watch ?? null, row.queued_at ?? null],
            },
            {
              sql: `UPDATE ingest_queue SET processing_status = 'processed', processed_at = datetime('now') WHERE id = ?`,
              args: [id],
            },
          ];

          if (status === 'published' && normalized.triggers!.length > 0) {
            for (const trigger of normalized.triggers!) {
              for (const intent of normalized.intents) {
                statements.push({
                  sql: `INSERT OR IGNORE INTO trigger_usecase_pairs (video_id, trigger_slug, intent_slug) VALUES (?, ?, ?)`,
                  args: [id, trigger, intent],
                });
              }
            }
          }

          await db.batch(statements, 'write');
        }

        enriched++;
        if (status === 'published') published++;
      } catch (err: any) {
        const errStr = `${String(err)} ${String(err?.cause ?? '')}`;
        const isTransient = /429|500|503|network|timeout|empty|fetch failed|UND_ERR/i.test(errStr);
        if (!dryRun) {
          if (isTransient) {
            await db.execute({
              sql: `UPDATE ingest_queue SET processing_status = 'pending', retry_count = retry_count + 1, failure_reason = ?, processed_at = datetime('now') WHERE id = ?`,
              args: [errStr.slice(0, 500), id],
            });
          } else {
            await db.execute({
              sql: `UPDATE ingest_queue SET processing_status = 'failed', failure_reason = 'classify_error', gemini_response = ?, processed_at = datetime('now') WHERE id = ?`,
              args: [errStr, id],
            });
            failed++;
          }
        } else {
          failed++;
        }
      }
    }));

    // Progress report every 100 rows
    const processed = enriched + failed + skippedShort;
    if (processed % 100 < concurrency) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / parseFloat(elapsed) * 60).toFixed(0);
      console.log(`  ${processed}/${pending.rows.length} — enriched=${enriched} published=${published} failed=${failed} shorts=${skippedShort} (${rate}/min, ${elapsed}s)`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s: enriched=${enriched}, published=${published}, failed=${failed}, shorts=${skippedShort}${dryRun ? ' (DRY RUN)' : ''}`);

  // Final stats
  if (!dryRun) {
    const stats = await db.execute(`SELECT
      (SELECT COUNT(*) FROM videos WHERE status='published') as total_published,
      (SELECT COUNT(*) FROM videos) as total_videos,
      (SELECT COUNT(*) FROM channels) as total_channels,
      (SELECT COUNT(*) FROM ingest_queue WHERE processing_status='pending') as queue_pending
    `);
    const s = stats.rows[0];
    console.log(`DB totals: ${s.total_published} published / ${s.total_videos} videos / ${s.total_channels} channels / ${s.queue_pending} queue pending`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
