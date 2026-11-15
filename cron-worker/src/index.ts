// cron-worker/src/index.ts
import { D1Adapter } from './d1-adapter';
import { runStage, type StageName } from './daily';
// weekly.ts (AI re-tagging + discovery) no longer imported: no AI spending (2026-11-15)
import { runLiveNow } from './stages/live-now';

export interface Env {
  YOUTUBE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  DB: D1Database;
}

// Refactor 2026-11-15 (owner: "kill old jobs"): the per-creator engine (tools/creator-build.mjs, GitHub) replaces
// discovery and AI tagging. Stopped: linkcheck, pillar, taxonomy, ingest, gapfill, and enrich in every free hour.
// Kept: deadcheck (YouTube 30-day rule for the stored catalog), triggerstats, indexnow, live-now (every 3 h).
const HOUR_PLAN: Record<number, StageName[]> = {
  // ponytail: 'hub' unscheduled 2026-10-25. Its aggregate read ~15M D1 rows per run (3x the 5M/day
  // free tier), which made /video/ and creator pages 503. Output only feeds combo-route redirects in
  // middleware, where stale counts are fine. Run by hand via ?mode=stage&stage=hub if ever needed.
  5: ['triggerstats'],
  6: ['indexnow'],
  // 'triage' and 'channelagg' removed: full catalog scans (channelagg ~1.2M reads/day) with no reader-visible output.
  // YouTube data refresh (30-day rule), spread over the day; other hours run enrich.
  7: ['deadcheck'], 9: ['deadcheck'], 11: ['deadcheck'], 13: ['deadcheck'], 15: ['deadcheck'], 17: ['deadcheck'], 19: ['deadcheck'],
  21: ['deadcheck'],
};
function stagesForHour(hour: number): StageName[] {
  return HOUR_PLAN[hour] ?? [];
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const u = new URL(req.url);
    const mode = u.searchParams.get('run');
    if (!mode) return new Response('cron worker', { status: 200 });
    // Manual runs need CRON_KEY (2026-11-15: was the DeepSeek key; all AI keys removed so nothing can spend on AI).
    if (!(env as any).CRON_KEY || u.searchParams.get('key') !== (env as any).CRON_KEY) return new Response('forbidden', { status: 403 });

    const db = new D1Adapter(env.DB);
    try {
      let stages: StageName[];
      if (mode === 'live') return Response.json(await runLiveNow(db, env.YOUTUBE_API_KEY));
      if (mode === 'stage') {
        stages = [u.searchParams.get('name') as StageName];
      } else if (mode === 'hour') {
        stages = stagesForHour(parseInt(u.searchParams.get('hour') || '-1'));
      } else {
        return new Response('unknown run mode (use stage|hour)', { status: 400 });
      }
      const results: Record<string, any> = {};
      for (const s of stages) results[s] = await runStage(db, env.YOUTUBE_API_KEY, env.DEEPSEEK_API_KEY, s);
      return Response.json({ ok: true, stages, results });
    } catch (e: any) {
      return new Response('FAILED:\n' + (e?.stack || e?.message || String(e)), { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env) {
    const db = new D1Adapter(env.DB);
    const hour = new Date(event.scheduledTime).getUTCHours();
    const dayOfWeek = new Date(event.scheduledTime).getUTCDay();

    // Weekly maintenance (AI re-tagging + discovery searches) stopped 2026-11-15: owner, no AI spending.

    // triggerstats scans the catalog per trigger (~2M D1 reads a run, 40% of the free daily limit): Thursdays only, away from Monday's deploy.
    // Live ASMR streams for /live-asmr/: every 3 hours, own try so a failure never blocks the hour's stage.
    if (hour % 3 === 0) {
      try { await runLiveNow(db, env.YOUTUBE_API_KEY); } catch (err) { console.error('live-now failed:', err); }
    }

    const stages = stagesForHour(hour).filter(s => !(s === 'triggerstats' && dayOfWeek !== 4)); // no AI enrich fallback
    for (const stage of stages) {
      try {
        await runStage(db, env.YOUTUBE_API_KEY, env.DEEPSEEK_API_KEY, stage);
      } catch (err) {
        console.error(`Stage ${stage} (hour ${hour}) failed:`, err);
      }
    }
  },
};
