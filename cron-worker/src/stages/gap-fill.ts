// cron-worker/src/stages/gap-fill.ts
import type { Client } from '../d1-adapter';
import { GAP_FILL_CAP, TAXONOMY_QUERIES } from '../constants';
import { searchVideos } from '../lib/youtube';
import { getCronState, bulkInsertIngestQueue, bulkInsertChannels, type IngestCandidate, type ChannelCandidate } from '../lib/helpers';

export async function runGapFill(db: Client, apiKey: string): Promise<{ queriesRun: number; videosFound: number }> {
  // Only run after taxonomy blitz is complete
  const searchIndex = parseInt(await getCronState(db, 'taxonomy_search_index') || '0');
  if (searchIndex < TAXONOMY_QUERIES.length) {
    return { queriesRun: 0, videosFound: 0 };
  }

  const gaps = await db.execute({
    sql: `SELECT slug, search_volume_tier, video_count FROM active_pages
          WHERE sitemap_eligible = FALSE AND page_type = 'intent_trigger'
            AND video_count < 15 AND video_count > 0
          ORDER BY CASE search_volume_tier WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 ELSE 4 END, video_count DESC
          LIMIT ?`,
    args: [GAP_FILL_CAP],
  });

  const videoCandidates: IngestCandidate[] = [];
  const channelCandidates: ChannelCandidate[] = [];
  for (const gap of gaps.rows) {
    const slug = gap.slug as string;
    const [intent, trigger] = slug.split('/');
    const query = `${trigger} asmr ${intent}`;
    const result = await searchVideos(apiKey, query, 50);

    for (const video of result.items) {
      videoCandidates.push({
        id: video.id.videoId, title: video.snippet.title,
        channelId: video.snippet.channelId, channelName: video.snippet.channelTitle,
        duration: 0, viewCount: 0, publishDate: video.snippet.publishedAt, description: video.snippet.description,
      });
      channelCandidates.push({ id: video.snippet.channelId, name: video.snippet.channelTitle });
    }
  }

  const videosFound = await bulkInsertIngestQueue(db, videoCandidates);
  await bulkInsertChannels(db, channelCandidates);

  return { queriesRun: gaps.rows.length, videosFound };
}
