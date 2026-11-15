// cron-worker/src/weekly.ts
import type { Client } from './d1-adapter';
import { WEEKLY_VIRAL_ROTATION, DISCOVERY_QUERIES } from './constants';
import { searchVideos } from './lib/youtube';
import { runEnrichBatch } from './stages/enrich-batch';
import { runLinkCrawler } from './stages/link-crawler';
import { getCronState, setCronState, insertIfNotExistsChannel } from './lib/helpers';

export async function runWeeklyMaintenance(db: Client, youtubeKey: string, deepseekKey: string): Promise<void> {
  console.log('Weekly cron: starting');

  // Failed enrichment retry — increment retry_count so we stop after 3 attempts
  await db.execute(`
    UPDATE ingest_queue SET processing_status = 'pending', retry_count = retry_count + 1
    WHERE processing_status = 'failed' AND retry_count < 3
      AND processed_at < datetime('now', '-7 days')
  `);
  const retried = await runEnrichBatch(db, deepseekKey);
  console.log(`Retry: ${retried.enriched} re-enriched, ${retried.failed} re-failed`);

  // Weekly viral discovery (v15: rotating query)
  const weekIndex = Math.floor(Date.now() / 604800000) % WEEKLY_VIRAL_ROTATION.length;
  const viralQuery = WEEKLY_VIRAL_ROTATION[weekIndex];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const viralResult = await searchVideos(youtubeKey, viralQuery, 50, sevenDaysAgo);
  let viralChannels = 0;
  for (const video of viralResult.items) {
    const added = await insertIfNotExistsChannel(db, video.snippet.channelId, video.snippet.channelTitle);
    if (added) viralChannels++;
  }
  console.log(`Viral discovery ('${viralQuery}'): ${viralChannels} new channels`);

  // Monthly channel discovery (when last_discovery_run > 28 days ago)
  const lastDiscovery = await getCronState(db, 'last_discovery_run');
  const daysSince = lastDiscovery ? (Date.now() - new Date(lastDiscovery).getTime()) / 86400000 : Infinity;
  if (daysSince >= 28) {
    let monthlyChannels = 0;
    for (const query of DISCOVERY_QUERIES) {
      const result = await searchVideos(youtubeKey, query, 50);
      for (const video of result.items) {
        const added = await insertIfNotExistsChannel(db, video.snippet.channelId, video.snippet.channelTitle);
        if (added) monthlyChannels++;
      }
    }
    await setCronState(db, 'last_discovery_run', new Date().toISOString());
    console.log(`Monthly discovery: ${monthlyChannels} new channels from ${DISCOVERY_QUERIES.length} queries`);
  }

  // Monthly ingest_queue cleanup (first Sunday of month)
  const today = new Date();
  if (today.getDate() <= 7) {
    const cleaned = await db.execute(`
      DELETE FROM ingest_queue WHERE processing_status IN ('processed', 'duplicate')
        AND processed_at < datetime('now', '-30 days')
    `);
    console.log(`Queue cleanup: ${cleaned.rowsAffected} rows deleted`);
  }

  // Link crawler — scan pillar pages for external hrefs
  const linkCrawl = await runLinkCrawler(db);
  console.log(`Link crawler: ${linkCrawl.pagesScanned} pages, ${linkCrawl.newLinks} new links queued`);

  console.log('Weekly cron: complete');
}
