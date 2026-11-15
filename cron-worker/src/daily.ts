// cron-worker/src/daily.ts
import type { Client } from './d1-adapter';
import { runTaxonomySearch } from './stages/taxonomy-search';
import { runIngestChannels } from './stages/ingest-channels';
import { runEnrichBatch, getDailyPublishCap } from './stages/enrich-batch';
import { runDeadCheck } from './stages/dead-check';
import { runChannelAggregation } from './stages/channel-agg';
import { runHubIntelligence } from './stages/hub-intelligence';
import { runGapFill } from './stages/gap-fill';
import { runPillarSeed } from './stages/pillar-seed';
import { runLinkValidator } from './stages/link-validator';
import { runTriggerStats } from './stages/trigger-stats';
import { runIndexNow } from './stages/indexnow';
import { runTriage } from './stages/triage';
import { getCronState, setCronState } from './lib/helpers';


// pipeline_start_date = when video publishing begins. Defaults if unset.
const PIPELINE_START_DEFAULT = '2026-05-31';
async function ensurePipelineStart(db: Client): Promise<string> {
  let pipelineStart = await getCronState(db, 'pipeline_start_date');
  if (!pipelineStart) {
    pipelineStart = PIPELINE_START_DEFAULT;
    await setCronState(db, 'pipeline_start_date', PIPELINE_START_DEFAULT);
  }
  return pipelineStart;
}

// Resolve the daily publish cap. Before pipeline_start_date → 0 (pillar-only).
// After → the calendar formula. Sitemap exposure is governed by Velocity Engine 2
// (getCap in src/lib/getCap.ts) — this cap only controls enrichment throughput.
async function resolvePublishCap(db: Client): Promise<number> {
  const pipelineStart = await ensurePipelineStart(db);
  return getDailyPublishCap(pipelineStart);
}

export type StageName =
  | 'pillar' | 'taxonomy' | 'ingest' | 'enrich'
  | 'deadcheck' | 'channelagg' | 'hub' | 'gapfill' | 'linkcheck' | 'finalize'
  | 'triggerstats' | 'indexnow' | 'triage';

// Free-tier Workers allow only 50 subrequests per invocation, so the full daily
// pipeline can't run at once. runStage executes ONE stage so each hourly cron
// tick (and each manual ?run=stage trigger) stays under the cap. See HOUR_PLAN
// in index.ts for the schedule and enrich gets most hours to drain the queue.
export async function runStage(db: Client, youtubeKey: string, deepseekKey: string, stage: StageName): Promise<any> {
  switch (stage) {
    case 'pillar':
      return runPillarSeed(db, youtubeKey);
    case 'taxonomy':
      return runTaxonomySearch(db, youtubeKey);
    case 'ingest':
      return runIngestChannels(db, youtubeKey);
    case 'enrich':
      return runEnrichBatch(db, deepseekKey, await resolvePublishCap(db));
    case 'deadcheck':
      return runDeadCheck(db, youtubeKey);
    case 'triggerstats':
      return runTriggerStats(db);
    case 'indexnow':
      return runIndexNow(db);
    case 'triage':
      return runTriage(db);
    case 'channelagg': {
      const affected = await db.execute(`
        SELECT DISTINCT channel_id FROM videos WHERE last_synchronized > datetime('now', '-1 day')
        UNION
        SELECT DISTINCT channel_id FROM videos WHERE status = 'deleted' AND last_synchronized > datetime('now', '-1 day')
      `);
      const ids = affected.rows.map(r => r.channel_id as string);
      return { reaggregated: await runChannelAggregation(db, ids) };
    }
    case 'hub':
      return runHubIntelligence(db);
    case 'gapfill':
      return runGapFill(db, youtubeKey);
    case 'linkcheck':
      return runLinkValidator(db);
    case 'finalize':
      await autoAdvancePhase(db);
      await setCronState(db, 'last_successful_run', new Date().toISOString());
      return { finalized: true };
  }
}

// Auto-phase advancement based on database metrics
// Phase 1→2: 500+ published videos, 10+ eligible pages
// Phase 2→3: 2000+ published videos, 40+ eligible pages
// Phase 3→4: 5000+ published videos, 80+ eligible pages
async function autoAdvancePhase(db: Client): Promise<void> {
  const currentPhase = parseInt(await getCronState(db, 'current_phase') || '1');
  if (currentPhase >= 4) return; // already at max

  const videoResult = await db.execute(`SELECT COUNT(*) as cnt FROM videos WHERE status = 'published'`);
  const publishedVideos = (videoResult.rows[0]?.cnt as number) ?? 0;

  const pageResult = await db.execute(`SELECT COUNT(*) as cnt FROM active_pages WHERE sitemap_eligible = TRUE`);
  const eligiblePages = (pageResult.rows[0]?.cnt as number) ?? 0;

  const thresholds: Record<number, { videos: number; pages: number }> = {
    1: { videos: 500, pages: 10 },
    2: { videos: 2000, pages: 40 },
    3: { videos: 5000, pages: 80 },
  };

  const next = thresholds[currentPhase];
  if (next && publishedVideos >= next.videos && eligiblePages >= next.pages) {
    const newPhase = currentPhase + 1;
    await setCronState(db, 'current_phase', String(newPhase));
    console.log(`PHASE ADVANCED: ${currentPhase} → ${newPhase} (${publishedVideos} videos, ${eligiblePages} eligible pages)`);
  }
}
