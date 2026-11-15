// cron-worker/src/stages/ingest-channels.ts
import type { Client } from '../d1-adapter';
import { CHANNEL_CAP } from '../constants';
import { getPlaylistItems, getVideoDetails, parseDuration } from '../lib/youtube';
import { bulkInsertIngestQueue, type IngestCandidate } from '../lib/helpers';

// Which of these ids already live in videos/ingest_queue? One subrequest per call.
async function existingIds(db: Client, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  const ph = ids.map(() => '?').join(',');
  const r = await db.execute({
    sql: `SELECT id FROM videos WHERE id IN (${ph}) UNION SELECT id FROM ingest_queue WHERE id IN (${ph})`,
    args: [...ids, ...ids],
  });
  for (const row of r.rows) out.add(row.id as string);
  return out;
}

export async function runIngestChannels(db: Client, apiKey: string): Promise<{ channelsProcessed: number; videosQueued: number }> {
  const channels = await db.execute({
    sql: `SELECT id, name FROM channels WHERE status IN ('pending_ingestion', 'active') ORDER BY last_updated ASC LIMIT ?`,
    args: [CHANNEL_CAP],
  });

  // Accumulate fresh candidates + channel status writes across all channels,
  // then flush ONCE each. Keeps the whole stage to a handful of subrequests
  // beyond the unavoidable per-page YouTube fetches.
  const candidates: IngestCandidate[] = [];
  const statusWrites: { sql: string; args: any[] }[] = [];

  for (const channel of channels.rows) {
    const channelId = channel.id as string;
    const playlistId = 'UU' + channelId.slice(2); // UC... -> UU... (uploads playlist)
    let pageToken: string | undefined;
    let consecutiveKnown = 0;

    try {
      do {
        const playlist = await getPlaylistItems(apiKey, playlistId, pageToken);
        const videoIds = playlist.items.map(i => i.snippet.resourceId.videoId);
        const details = await getVideoDetails(apiKey, videoIds);

        // One existence query per page drives the "3 consecutive known → channel
        // already ingested, stop paginating" early-out without per-row db calls.
        const known = await existingIds(db, details.items.map(v => v.id));
        let stop = false;
        for (const video of details.items) {
          if (known.has(video.id)) {
            consecutiveKnown++;
            if (consecutiveKnown >= 3) { stop = true; break; }
            continue;
          }
          consecutiveKnown = 0;
          candidates.push({
            id: video.id, title: video.snippet.title,
            channelId: video.snippet.channelId, channelName: video.snippet.channelTitle,
            duration: parseDuration(video.contentDetails.duration),
            viewCount: parseInt(video.statistics.viewCount || '0'),
            publishDate: video.snippet.publishedAt, description: video.snippet.description,
          });
        }

        if (stop) break;
        pageToken = playlist.nextPageToken;
      } while (pageToken);

      statusWrites.push({
        sql: `UPDATE channels SET status = 'active', last_updated = datetime('now') WHERE id = ?`,
        args: [channelId],
      });
    } catch (err) {
      const isGone = String(err).includes('404') || String(err).includes('403');
      statusWrites.push({
        sql: `UPDATE channels SET status = ?, last_updated = datetime('now') WHERE id = ?`,
        args: [isGone ? 'dead' : 'active', channelId],
      });
    }
  }

  const videosQueued = await bulkInsertIngestQueue(db, candidates);
  if (statusWrites.length > 0) await db.batch(statusWrites, 'write');
  return { channelsProcessed: channels.rows.length, videosQueued };
}
