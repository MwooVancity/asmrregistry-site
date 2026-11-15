// tools/keyword-ingest.ts — Ingest videos from YouTube keyword search (not just seeded channels).
//
//   npx tsx tools/keyword-ingest.ts
//   npx tsx tools/keyword-ingest.ts --pages 2 --dry-run
//
// Cost: 100 quota units per search page (search.list). Default: ~40 queries × 2 pages = 80 calls.
// Each search.list page returns up to 50 results.

import 'dotenv/config';
import { searchVideos, getVideoDetails, parseDuration } from '../scripts/lib/youtube.js';
import { getDb, bulkInsertIngestQueue, type IngestCandidate } from '../scripts/lib/db.js';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) { console.error('Missing YOUTUBE_API_KEY in .env'); process.exit(1); }

// One query per trigger — covers all niches in enrichment.ts
const DEFAULT_QUERIES = [
  'asmr tapping',
  'asmr scratching',
  'asmr whispering',
  'asmr soft spoken',
  'asmr typing keyboard',
  'asmr crinkling',
  'asmr page turning',
  'asmr brushing',
  'asmr hair play scalp',
  'asmr eating mukbang',
  'asmr mouth sounds',
  'asmr kisses',
  'asmr rain thunderstorm',
  'asmr ocean waves beach',
  'asmr fireplace crackling',
  'asmr nature forest birds',
  'asmr writing pen pencil',
  'asmr cooking kitchen',
  'asmr soap carving',
  'asmr sand',
  'asmr slime',
  'asmr water dripping pouring',
  'asmr massage',
  'asmr breathing',
  'asmr reading aloud bedtime story',
  'asmr painting drawing',
  'asmr clicking mouse',
  'asmr spraying misting',
  'asmr folding origami',
  'asmr singing bowl crystal',
  'asmr binaural',
  'asmr white noise fan',
  'asmr no talking',
  'asmr positive affirmations',
  'asmr counting',
  'asmr personal attention cranial nerve',
  'asmr light triggers visual',
  // bonus: high-volume intent queries
  'asmr for sleep',
  'asmr for studying focus',
  'asmr relaxing',
];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const queriesFlag = args.indexOf('--queries');
const pagesFlag = args.indexOf('--pages');
const queries = queriesFlag >= 0 ? args[queriesFlag + 1].split(',') : DEFAULT_QUERIES;
const maxPages = pagesFlag >= 0 ? parseInt(args[pagesFlag + 1]) : 2;

const db = getDb();
let totalFound = 0;
let totalQueued = 0;

console.log(`Keyword ingest: ${queries.length} queries × ${maxPages} pages, dry-run=${dryRun}`);

for (const query of queries) {
  let pageToken: string | undefined;
  const candidates: IngestCandidate[] = [];

  for (let page = 0; page < maxPages; page++) {
    try {
      const result = await searchVideos(YOUTUBE_API_KEY, query, 50, pageToken);
      if (!result.items?.length) break;

      const videoIds = result.items.map(i => i.id.videoId).filter(Boolean);
      if (videoIds.length === 0) break;

      const details = await getVideoDetails(YOUTUBE_API_KEY, videoIds);
      for (const video of details.items) {
        candidates.push({
          id: video.id,
          title: video.snippet.title,
          channelId: video.snippet.channelId,
          channelName: video.snippet.channelTitle,
          duration: parseDuration(video.contentDetails.duration),
          viewCount: parseInt(video.statistics.viewCount || '0'),
          publishDate: video.snippet.publishedAt,
          description: video.snippet.description,
        });
      }

      pageToken = result.nextPageToken;
      if (!pageToken) break;
    } catch (e: any) {
      console.error(`  [${query}] page ${page} failed: ${e.message}`);
      break;
    }
  }

  totalFound += candidates.length;

  if (!dryRun && candidates.length > 0) {
    const queued = await bulkInsertIngestQueue(db, candidates);
    totalQueued += queued;
    if (queued > 0) console.log(`  "${query}": ${candidates.length} found, ${queued} new queued`);
  } else {
    console.log(`  "${query}": ${candidates.length} found`);
  }
}

console.log(`\nTotal found: ${totalFound} | New queued: ${dryRun ? '(dry-run)' : totalQueued}`);
if (!dryRun) console.log('Run backfill-enrich.ts next to classify + publish them.');
