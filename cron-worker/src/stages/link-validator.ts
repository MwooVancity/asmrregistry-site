// cron-worker/src/stages/link-validator.ts
// Stage 2: Check HTTP status of queued links — small batch per run, polite throttling
import type { Client } from '../d1-adapter';

const BATCH_SIZE = 15;
const BROKEN_CODES = new Set([404, 410, 500, 502, 503]);
// Re-check healthy after 30 days, broken after 14 days
const HEALTHY_RECHECK_DAYS = 30;
const BROKEN_RECHECK_DAYS = 14;

export async function runLinkValidator(db: Client): Promise<{ checked: number; broken: number; healthy: number }> {
  // Deduplicate by target_url — if same URL appears on 5 pages, check it once
  const pending = await db.execute({
    sql: `SELECT DISTINCT target_url FROM link_checks
          WHERE status = 'pending'
             OR (status IN ('healthy','timeout','error') AND (checked_at IS NULL OR checked_at < datetime('now', ?)))
             OR (status = 'broken' AND checked_at < datetime('now', ?))
          LIMIT ?`,
    args: [`-${HEALTHY_RECHECK_DAYS} days`, `-${BROKEN_RECHECK_DAYS} days`, BATCH_SIZE],
  });

  let checked = 0, broken = 0, healthy = 0;

  for (const row of pending.rows) {
    const url = row.target_url as string;
    const { status, statusCode } = await checkUrl(url);

    await db.execute({
      sql: `UPDATE link_checks SET status = ?, status_code = ?, checked_at = datetime('now') WHERE target_url = ?`,
      args: [status, statusCode, url],
    });

    checked++;
    if (status === 'broken') broken++;
    else if (status === 'healthy') healthy++;
  }

  return { checked, broken, healthy };
}

async function checkUrl(url: string): Promise<{ status: string; statusCode: number | null }> {
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    });

    // Some servers reject HEAD — fall back to GET
    if (res.status === 405) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      });
    }

    const statusCode = res.status;
    const status = BROKEN_CODES.has(statusCode) ? 'broken' : 'healthy';
    return { status, statusCode };
  } catch (err) {
    const isTimeout = String(err).includes('TimeoutError') || String(err).includes('AbortError');
    return { status: isTimeout ? 'timeout' : 'error', statusCode: null };
  }
}
