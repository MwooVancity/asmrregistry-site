// src/api/cron-monitor.ts — Autonomous monitoring cron handler
// Triggered every 6h (health check) and daily (ingest trigger)
// Returns: { status, metrics, next_action }

import type { APIRoute } from 'astro';
import { getDb } from '../lib/db';
import { detectStaleVideos } from '../../tools/video-availability-cron';
import { auditFreshnessHonesty } from '../../tools/audit-freshness-honesty';

export const POST: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET || '';

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const db = getDb();

  try {
    // Fetch metrics
    const videoCount = await db.execute('SELECT COUNT(*) as count FROM videos WHERE status = \'published\'');
    const queueDepth = await db.execute('SELECT COUNT(*) as count FROM ingest_queue');
    const pendingChannels = await db.execute('SELECT COUNT(*) as count FROM channels WHERE status = "pending_ingestion"');

    const published = videoCount.rows[0]?.count || 0;
    const queued = queueDepth.rows[0]?.count || 0;
    const pending = pendingChannels.rows[0]?.count || 0;

    // Run kill-switch audits
    const stale = await detectStaleVideos();
    const freshness = await auditFreshnessHonesty();

    const staleRate = published > 0 ? (stale.length / published) : 0;
    const freshRate = freshness.length;

    const kills = {
      stale_kill: staleRate > 0.1,
      freshness_kill: freshRate > 5,
      queue_kill: queued > 10000,  // Too many queued, ingest can't keep up
    };

    const metrics = {
      published,
      queued,
      pending,
      stale_rate: (staleRate * 100).toFixed(1) + '%',
      freshness_violations: freshRate,
      kill_switch_active: Object.values(kills).some(v => v),
    };

    // Decision: trigger ingest if queue is low and pending channels exist
    const shouldTriggerIngest = queued < 50 && pending > 0 && !kills.queue_kill;

    return new Response(JSON.stringify({
      status: kills.stale_kill || kills.freshness_kill ? 'CRITICAL' : 'OK',
      metrics,
      kill_switches: kills,
      next_action: shouldTriggerIngest ? 'trigger_ingest' : 'monitor',
      timestamp: new Date().toISOString(),
    }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('Cron monitor error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
};
