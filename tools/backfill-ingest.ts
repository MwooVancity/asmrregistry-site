// tools/backfill-ingest.ts — Ingest full upload history from pending channels.
// No Worker subrequest limits — pulls entire upload playlists locally.
//
//   npx tsx tools/backfill-ingest.ts [--channels N] [--dry-run]
//
// Default: 50 channels per run. Each channel costs ~1 API unit per 50 videos.
// A channel with 500 videos = 10 API calls = 10 units. 50 channels ≈ 500-2000 units.

import 'dotenv/config';
import { getPlaylistItems, getVideoDetails, parseDuration } from '../scripts/lib/youtube.js';
import { getDb, bulkInsertIngestQueue, type IngestCandidate } from '../scripts/lib/db.js';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) { console.error('Missing YOUTUBE_API_KEY in .env'); process.exit(1); }

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const channelsFlag = args.indexOf('--channels');
const maxChannels = channelsFlag >= 0 ? parseInt(args[channelsFlag + 1]) : 50;

async function existingIds(db: ReturnType<typeof getDb>, ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const ph = chunk.map(() => '?').join(',');
    const r = await db.execute({
      sql: `SELECT id FROM videos WHERE id IN (${ph}) UNION SELECT id FROM ingest_queue WHERE id IN (${ph})`,
      args: [...chunk, ...chunk],
    });
    for (const row of r.rows) out.add(row.id as string);
  }
  return out;
}

async function main() {
  const db = getDb();

  // --channel <id>: one creator at a time (owner 2026-11-15), whatever its status.
  const one = args.indexOf('--channel') >= 0 ? args[args.indexOf('--channel') + 1] : null;
  const channels = one
    ? await db.execute({ sql: `SELECT id, name FROM channels WHERE id = ? UNION SELECT ? AS id, ? AS name WHERE NOT EXISTS (SELECT 1 FROM channels WHERE id = ?)`, args: [one, one, one, one] })
    : await db.execute({
        sql: `SELECT id, name FROM channels WHERE status = 'pending_ingestion' ORDER BY last_updated ASC LIMIT ?`,
        args: [maxChannels],
      });

  console.log(`Backfill ingest: ${channels.rows.length} pending channels (cap ${maxChannels}), dry-run=${dryRun}`);
  if (channels.rows.length === 0) { console.log('No pending channels.'); return; }

  let totalQueued = 0;
  let channelsProcessed = 0;
  let channelsFailed = 0;

  for (const channel of channels.rows) {
    const channelId = channel.id as string;
    const channelName = channel.name as string;
    const playlistId = 'UU' + channelId.slice(2);
    let pageToken: string | undefined;
    let consecutiveKnown = 0;
    const candidates: IngestCandidate[] = [];

    try {
      let pages = 0;
      do {
        const playlist = await getPlaylistItems(YOUTUBE_API_KEY, playlistId, pageToken);
        const videoIds = playlist.items.map(i => i.snippet.resourceId.videoId);

        if (videoIds.length === 0) break;

        const details = await getVideoDetails(YOUTUBE_API_KEY, videoIds);
        const known = await existingIds(db, details.items.map(v => v.id));

        let stop = false;
        for (const video of details.items) {
          if (known.has(video.id)) {
            consecutiveKnown++;
            if (consecutiveKnown >= 5) { stop = true; break; }
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
        pages++;
      } while (pageToken);

      if (!dryRun) {
        const queued = await bulkInsertIngestQueue(db, candidates);
        await db.execute({
          sql: `UPDATE channels SET status = 'active', last_updated = datetime('now') WHERE id = ?`,
          args: [channelId],
        });
        totalQueued += queued;
      }

      channelsProcessed++;
      if (channelsProcessed % 10 === 0 || candidates.length > 100) {
        console.log(`  [${channelsProcessed}/${channels.rows.length}] ${channelName}: ${candidates.length} videos found`);
      }
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('403') && errStr.includes('quotaExceeded')) {
        console.error(`YouTube API quota exceeded after ${channelsProcessed} channels. Stopping.`);
        break;
      }
      const isGone = errStr.includes('404') || (errStr.includes('403') && !errStr.includes('quota'));
      if (!dryRun) {
        await db.execute({
          sql: `UPDATE channels SET status = ?, last_updated = datetime('now') WHERE id = ?`,
          args: [isGone ? 'dead' : 'active', channelId],
        });
      }
      channelsFailed++;
      console.warn(`  ${channelName} (${channelId}): ${isGone ? 'DEAD' : 'ERROR'} — ${errStr.slice(0, 120)}`);
    }
  }

  console.log(`\nDone: ${channelsProcessed} channels processed, ${channelsFailed} failed, ${totalQueued} videos queued${dryRun ? ' (DRY RUN)' : ''}`);
}

main().catch(err => { console.error(err); process.exit(1); });
