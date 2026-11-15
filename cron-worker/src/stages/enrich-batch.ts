// cron-worker/src/stages/enrich-batch.ts
import type { Client } from '../d1-adapter';
import { ENRICH_BATCH, CONFIDENCE_DRIFT_THRESHOLD, CONFIDENCE_DRIFT_WINDOW_DAYS, MAX_ENRICHMENT_RETRIES, matchTriggers, bucketFromSeconds, TRIGGER_KEYWORDS } from '../constants';
import { validateEnrichment } from '../validators/enrichment';
import { getCronState, setCronState } from '../lib/helpers';

// v16: throughput uncapped to 50/day. Quality gates unchanged — confidence ≥0.7,
// is_asmr, full classification, per-page indexability gate, sitemap mirror gate.
// Volume of GATED pages is not a flood; the gates are the law line.
const VE2_CAP_START    = 500;
const VE2_CAP_MAX      = 500;
const VE2_QUARTER_STEP = 0;
const VE2_QUARTER_DAYS = 90;

export function getDailyPublishCap(startDateIso: string | null): number {
  if (!startDateIso) return 0;
  const start = new Date(startDateIso);
  if (Date.now() < start.getTime()) return 0;
  const daysSince = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  const quarters = Math.floor(Math.max(0, daysSince) / VE2_QUARTER_DAYS);
  return Math.min(VE2_CAP_MAX, VE2_CAP_START + quarters * VE2_QUARTER_STEP);
}

export async function runEnrichBatch(db: Client, deepseekApiKey: string, publishCap = 9999): Promise<{ enriched: number; published: number; failed: number; paused: boolean; cap: number }> {
  // Enrichment now runs locally via tools/daily-videos.ts (keyword classifier, $0/day).
  return { enriched: 0, published: 0, failed: 0, paused: true, cap: 0 };
  // Semantic drift circuit breaker: check 7-day rolling avg confidence
  const avgConfResult = await db.execute(`
    SELECT AVG(confidence) as avg_conf FROM videos
    WHERE status = 'published' AND created_at > datetime('now', '-${CONFIDENCE_DRIFT_WINDOW_DAYS} days')
  `);
  const recentAvgConf = avgConfResult.rows[0]?.avg_conf as number | null;
  const baselineConf = await getCronState(db, 'baseline_confidence');

  if (recentAvgConf !== null && baselineConf) {
    const baseline = parseFloat(baselineConf);
    if (baseline > 0 && (baseline - recentAvgConf) / baseline > CONFIDENCE_DRIFT_THRESHOLD) {
      console.warn(`CIRCUIT BREAKER: Confidence drift detected. Baseline: ${baseline.toFixed(3)}, Current 7d avg: ${recentAvgConf.toFixed(3)}. Enrichment paused.`);
      return { enriched: 0, published: 0, failed: 0, paused: true, cap: publishCap };
    }
  }

  // Reclaim stale enriching rows
  await db.execute(`UPDATE ingest_queue SET processing_status = 'pending' WHERE processing_status = 'enriching' AND queued_at < datetime('now', '-1 hour')`);

  // Fetch pending rows: uploads from the last 30 days first (newest first, via idx_queue_status_pub), then the highest
  // view count. Ranking by views alone left new uploads behind 100K+ older rows until the 30-day purge removed them.
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19) + 'Z';
  const pending = await db.execute({
    sql: `SELECT * FROM (SELECT * FROM ingest_queue WHERE processing_status = 'pending' AND raw_publish_date >= ?
            ORDER BY raw_publish_date DESC LIMIT ?)
          UNION ALL SELECT * FROM (SELECT * FROM ingest_queue WHERE processing_status = 'pending' AND (raw_publish_date IS NULL OR raw_publish_date < ?)
            ORDER BY COALESCE(raw_view_count, 0) DESC, queued_at ASC LIMIT ?) LIMIT ?`,
    args: [since, ENRICH_BATCH, since, ENRICH_BATCH, ENRICH_BATCH],
  });

  // Count how many we've already published today. Compare against datetime('now',
  // 'start of day') so both sides use SQLite's space-separated format — a JS
  // toISOString() ('...T00:00:00Z') string-compares WRONG against stored
  // '2026-06-03 12:00:00' (space 0x20 < 'T' 0x54), which silently zeroed the
  // count and let the daily publish cap be exceeded.
  // created_at, not last_synchronized: the YouTube refresh (dead-check) bumps last_synchronized on thousands of old
  // videos a day, which would fill the cap and stop publishing.
  const todayPublished = await db.execute(
    `SELECT COUNT(*) as cnt FROM videos WHERE status='published' AND created_at >= datetime('now', 'start of day')`
  );
  let publishedToday = (todayPublished.rows[0]?.cnt as number) ?? 0;

  let enriched = 0, published = 0, failed = 0;
  const confidenceScores: number[] = [];

  // Process in chunks of 10 for concurrency
  for (let i = 0; i < pending.rows.length; i += 10) {
    const chunk = pending.rows.slice(i, i + 10);

    await Promise.all(chunk.map(async (row) => {
      const id = row.id as string;

      // CAS claim
      const claimed = await db.execute({
        sql: `UPDATE ingest_queue SET processing_status = 'enriching' WHERE id = ? AND processing_status = 'pending'`,
        args: [id],
      });
      if (claimed.rowsAffected === 0) return;

        // Reject shorts (under 5 minutes)
        const duration = row.raw_duration_seconds as number | null;
        if (duration !== null && duration > 0 && duration < 300) {
          await db.execute({
            sql: `UPDATE ingest_queue SET processing_status = 'failed', failure_reason = 'too_short', processed_at = datetime('now') WHERE id = ?`,
            args: [id],
          });
          failed++;
          return;
        }

      try {
        const geminiOutput = await callDeepSeek(deepseekApiKey, row);
        const { valid, failureReason, normalized } = validateEnrichment(geminiOutput);

        if (!valid) {
          await db.execute({
            sql: `UPDATE ingest_queue SET processing_status = 'failed', failure_reason = ?, gemini_response = ?, processed_at = datetime('now') WHERE id = ?`,
            args: [failureReason!, JSON.stringify(geminiOutput), id],
          });
          failed++;
          return;
        }

        confidenceScores.push(normalized.confidence);

        // Derive triggers from title + description keywords (multi-trigger coverage)
        const keywordTriggers = matchTriggers(row.raw_title as string, (row.raw_description as string | null) ?? undefined);
        // Keyword triggers win when they match; otherwise keep the classifier's own answer
        // (blanking it left many published videos with no trigger at all).
        if (keywordTriggers.length) {
          normalized.triggers = keywordTriggers;
          normalized.primary_trigger = keywordTriggers[0];
        } else {
          // Classifier answers are free text: keep only real taxonomy triggers (no hub page = dead link).
          normalized.triggers = (normalized.triggers ?? []).filter(t => t in TRIGGER_KEYWORDS);
          normalized.primary_trigger = normalized.primary_trigger in TRIGGER_KEYWORDS ? normalized.primary_trigger : (normalized.triggers[0] ?? '');
        }

        // Derive duration_bucket from the real video length when known (more
        // accurate and drift-proof than the model's value).
        const durSec = row.raw_duration_seconds as number | null;
        if (durSec !== null && durSec > 0) normalized.duration_bucket = bucketFromSeconds(durSec);

        // Publish anything that passes confidence threshold, up to daily cap
        const wouldPublish = normalized.confidence >= 0.7 && normalized.is_asmr;
        const status = (wouldPublish && publishedToday < publishCap) ? 'published' : (normalized.is_asmr ? 'draft' : 'rejected');
        if (wouldPublish && status === 'published') publishedToday++;

        const statements = [
          {
            sql: `INSERT OR IGNORE INTO videos (id, title, channel_id, channel_name, duration_seconds, publish_date, view_count, primary_trigger, triggers, intents, intensity, language, format, modifiers, duration_bucket, roleplay_scenario, confidence, is_asmr, status, why_watch, created_at, last_synchronized)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`,
            // last_synchronized = when YouTube data was fetched (queued_at), so the 30-day refresh clock starts there.
            args: [id, row.raw_title, row.raw_channel_id, row.raw_channel_name, row.raw_duration_seconds, row.raw_publish_date, row.raw_view_count, normalized.primary_trigger, JSON.stringify(normalized.triggers), JSON.stringify(normalized.intents), normalized.intensity, normalized.language, normalized.format, JSON.stringify(normalized.modifiers), normalized.duration_bucket, normalized.roleplay_scenario, normalized.confidence, normalized.is_asmr, status, normalized.why_watch ?? null, row.queued_at ?? null],
          },
          {
            sql: `UPDATE ingest_queue SET processing_status = 'processed', processed_at = datetime('now') WHERE id = ?`,
            args: [id],
          },
        ];

        if (status === 'published' && normalized.triggers.length > 0) {
          for (const trigger of normalized.triggers) {
            for (const intent of normalized.intents) {
              statements.push({
                sql: `INSERT INTO trigger_usecase_pairs (video_id, trigger_slug, intent_slug) VALUES (?, ?, ?)`,
                args: [id, trigger, intent],
              });
            }
          }
        }

        await db.batch(statements, 'write');
        enriched++;
        if (status === 'published') published++;

      } catch (err) {
        const errStr = String(err);
        const isTransient = /429|500|503|network|timeout|empty/i.test(errStr);
        const retryResult = await db.execute({ sql: `SELECT COALESCE(retry_count, 0) as rc FROM ingest_queue WHERE id = ?`, args: [id] });
        const retryCount = (retryResult.rows[0]?.rc as number) ?? 0;
        if (isTransient && retryCount < MAX_ENRICHMENT_RETRIES) {
          await db.execute({
            sql: `UPDATE ingest_queue SET processing_status = 'pending', retry_count = retry_count + 1, failure_reason = ?, processed_at = datetime('now') WHERE id = ?`,
            args: [errStr.slice(0, 500), id],
          });
        } else {
          await db.execute({
            sql: `UPDATE ingest_queue SET processing_status = 'failed', failure_reason = 'deepseek_error', gemini_response = ?, retry_count = retry_count + 1, processed_at = datetime('now') WHERE id = ?`,
            args: [errStr, id],
          });
          failed++;
        }
      }
    }));
  }

  // Update baseline confidence if this is the first run or periodically
  if (confidenceScores.length >= 50 && !baselineConf) {
    const avg = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length;
    await setCronState(db, 'baseline_confidence', String(avg));
  }

  // Failure rate alert
  const total = enriched + failed;
  if (total >= 50 && failed / total > 0.05) {
    console.warn(`ALERT: ${Math.round(failed / total * 100)}% enrichment failure rate (${failed}/${total})`);
  }

  return { enriched, published, failed, paused: false, cap: publishCap };
}

async function callDeepSeek(apiKey: string, row: any): Promise<any> {
  const durationInfo = row.raw_duration_seconds && row.raw_duration_seconds > 0
    ? `Duration: ${row.raw_duration_seconds}s`
    : 'Duration: unknown (estimate from title/description)';

  const prompt = `Classify this YouTube video as ASMR content. Return JSON only, no other text.

Title: ${row.raw_title}
Channel: ${row.raw_channel_name}
${durationInfo}
Description: ${(row.raw_description || '').slice(0, 500)}

Return this exact JSON structure (no markdown, no explanation, just the JSON object):
{"intents":["sleep","relax"],"intensity":3,"format":"ambient","roleplay_scenario":null,"modifiers":[],"duration_bucket":"1-hour","language":"en","confidence":0.85,"is_asmr":true,"why_watch":"REQUIRED. 2-3 sentences. Sentence 1: what specific trigger technique or sound design makes this video distinctive (e.g. close-mic rain on glass, layered tapping at varying speeds). Sentence 2: who it works best for and why (e.g. light sleepers who need consistent volume, students who want zero voice distraction). Sentence 3: one concrete detail about pacing, transitions, or production quality."}

intents must be from: sleep, study, relax, tingles, anxiety, insomnia, meditation, background, adhd, headache, depression, kids, tinnitus

duration_bucket must be one of: 5-minutes, 10-minutes, 15-minutes, 20-minutes, 30-minutes, 1-hour, 2-hours, 3-hours, 4-hours, 8-hours, 10-hours, looped

format must be one of: ambient, roleplay, guided, compilation, tutorial

If format is "roleplay", roleplay_scenario must be one of: medical-roleplay, dentist-roleplay, barber-roleplay, spa-roleplay, library, coffee-shop, hotel-checkin, friend-roleplay, teacher-roleplay, therapist-roleplay, makeup-artist, tattoo-artist, eye-exam, camping, airplane, astrologer-roleplay, fairy-roleplay, vampire-roleplay, elf-roleplay, alien-roleplay, witch-roleplay, robot-roleplay, time-traveler-roleplay, caring-presence, mentor-roleplay

Set is_asmr to false if this is not ASMR content. Set confidence between 0.0 and 1.0.`;

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty DeepSeek response');

  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  return JSON.parse(cleaned);
}
