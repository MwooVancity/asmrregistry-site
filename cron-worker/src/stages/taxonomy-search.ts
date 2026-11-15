// cron-worker/src/stages/taxonomy-search.ts
// "Search Demand First" strategy — cycles through 175 demand-signal queries continuously.
// order=viewCount is set in searchVideos (youtube.ts). Index resets after full cycle.
import type { Client } from '../d1-adapter';
import { TAXONOMY_QUERIES, TAXONOMY_SEARCH_CAP } from '../constants';
import { searchVideos } from '../lib/youtube';
import { getCronState, setCronState, bulkInsertIngestQueue, bulkInsertChannels, type IngestCandidate, type ChannelCandidate } from '../lib/helpers';

export async function runTaxonomySearch(db: Client, apiKey: string): Promise<{ queriesRun: number; videosFound: number; channelsFound: number }> {
  let searchIndex = parseInt(await getCronState(db, 'taxonomy_search_index') || '0');

  // Auto-reset after full cycle so high-demand S-tier queries get re-fetched continuously
  if (searchIndex >= TAXONOMY_QUERIES.length) {
    searchIndex = 0;
    await setCronState(db, 'taxonomy_search_index', '0');
  }

  const slice = TAXONOMY_QUERIES.slice(searchIndex, searchIndex + TAXONOMY_SEARCH_CAP);

  // Collect every search result across the slice, then bulk-insert ONCE. Avoids
  // ~2 db.execute() subrequests per result row (15 queries × 50 = 750 rows).
  const videoCandidates: IngestCandidate[] = [];
  const channelCandidates: ChannelCandidate[] = [];

  for (const item of slice) {
    try {
      // 50 results per query, sorted by viewCount (highest-proven demand first)
      const result = await searchVideos(apiKey, item.query, 50);
      for (const video of result.items) {
        videoCandidates.push({
          id: video.id.videoId, title: video.snippet.title,
          channelId: video.snippet.channelId, channelName: video.snippet.channelTitle,
          duration: 0, viewCount: 0, publishDate: video.snippet.publishedAt, description: video.snippet.description,
        });
        channelCandidates.push({ id: video.snippet.channelId, name: video.snippet.channelTitle });
      }
    } catch (err) {
      // Log and continue — one bad query shouldn't kill the batch
      console.warn(`Taxonomy search failed for "${item.query}": ${err}`);
    }
  }

  const videosFound = await bulkInsertIngestQueue(db, videoCandidates);
  const channelsFound = await bulkInsertChannels(db, channelCandidates);

  await setCronState(db, 'taxonomy_search_index', String(searchIndex + slice.length));
  return { queriesRun: slice.length, videosFound, channelsFound };
}
