// tools/channel-discover.ts — Aggressive ASMR channel discovery via YouTube search.
// Searches a broad query set, extracts unique channels, seeds the channels table.
//
//   npx tsx tools/channel-discover.ts [--queries N] [--dry-run]
//
// Default: 30 queries (~3,000 YouTube API units). Each query returns up to 50 videos,
// yielding ~500-1,500 unique new channels per run.
//
// YouTube API quota: search.list = 100 units/call. Default daily quota = 10,000 units.
// This script uses ~3,000 units at default. Leave headroom for cron worker + ingest.

import 'dotenv/config';
import { searchVideos } from '../scripts/lib/youtube.js';
import { getDb, bulkInsertChannels, type ChannelCandidate } from '../scripts/lib/db.js';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
if (!YOUTUBE_API_KEY) { console.error('Missing YOUTUBE_API_KEY in .env'); process.exit(1); }

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const queriesFlag = args.indexOf('--queries');
const maxQueries = queriesFlag >= 0 ? parseInt(args[queriesFlag + 1]) : 30;

// Broader than the cron taxonomy queries — includes channel-finding queries,
// language variants, trending terms, and cross-niche exploration.
const DISCOVERY_QUERIES = [
  // High-volume head terms (video search — finds channels as byproduct)
  'asmr', 'asmr sleep', 'asmr for sleep', 'asmr no talking',
  'asmr rain', 'asmr tapping', 'asmr whispering', 'asmr relaxing',
  'asmr eating', 'asmr mukbang', 'asmr roleplay', 'asmr typing',
  'asmr hair brushing', 'asmr massage', 'asmr cooking',
  'asmr soft spoken', 'asmr mouth sounds', 'asmr scratching',
  'asmr ocean waves', 'asmr fireplace', 'asmr nature sounds',
  'asmr personal attention', 'asmr breathing', 'asmr reading',

  // Intent-based (catches niche creators)
  'asmr for anxiety', 'asmr for studying', 'asmr for adhd',
  'asmr for headache', 'asmr for insomnia', 'asmr for depression',
  'asmr meditation', 'asmr for kids bedtime', 'asmr for tinnitus',

  // Duration-based (catches long-form creators)
  'asmr 1 hour', 'asmr 3 hours', 'asmr 8 hours', 'asmr 10 hours',
  'asmr looped', 'asmr all night', 'asmr overnight',

  // Language niches (large underserved audiences)
  'korean asmr', 'japanese asmr', 'spanish asmr', 'french asmr',
  'german asmr', 'portuguese asmr', 'chinese asmr', 'italian asmr',
  'russian asmr', 'turkish asmr', 'hindi asmr', 'arabic asmr',

  // Format-specific
  'asmr compilation', 'asmr tutorial', 'asmr guided meditation',
  'asmr binaural', 'asmr 3d audio',

  // Trending / seasonal
  'asmr 2024', 'asmr 2025', 'new asmr', 'best asmr',
  'asmr viral', 'asmr satisfying',

  // Niche triggers (finds specialist creators)
  'asmr soap carving', 'asmr slime', 'asmr sand',
  'asmr glass sounds', 'asmr water sounds', 'asmr crinkling',
  'asmr page turning', 'asmr writing', 'asmr painting',
  'asmr clicking', 'asmr keyboard',

  // Roleplay niches
  'asmr doctor', 'asmr dentist', 'asmr barber', 'asmr spa',
  'asmr library', 'asmr coffee shop', 'asmr hotel',
  'asmr witch', 'asmr vampire', 'asmr fairy',

  // Meta / discovery (people searching for channels)
  'best asmr channels', 'top asmr youtubers', 'underrated asmr',
  'new asmr channels', 'male asmr', 'asmr artist',

  // Cross-niche (catches creators who do ASMR + other content)
  'asmr gaming', 'asmr unboxing', 'asmr skincare', 'asmr makeup',
];

async function main() {
  const db = getDb();
  const queries = DISCOVERY_QUERIES.slice(0, maxQueries);

  console.log(`Channel discovery: ${queries.length} queries, dry-run=${dryRun}`);

  // Discovery seeds CHANNELS only. We deliberately do NOT queue the search-result
  // videos directly: search.list returns no contentDetails/statistics, so those rows
  // would land with duration_seconds=0 (unverified) and could publish as thin pages.
  // Instead, backfill-ingest pulls each channel's uploads with FULL details, so every
  // queued video carries real duration + view_count. (Root-cause fix, 2026-06-12.)
  const channelCandidates: ChannelCandidate[] = [];
  let queriesRun = 0;

  for (const query of queries) {
    try {
      const result = await searchVideos(YOUTUBE_API_KEY, query, 50);
      for (const video of result.items) {
        channelCandidates.push({ id: video.snippet.channelId, name: video.snippet.channelTitle });
      }
      queriesRun++;
      if (queriesRun % 10 === 0) console.log(`  ${queriesRun}/${queries.length} queries done, ${channelCandidates.length} channel candidates`);
    } catch (err) {
      const errStr = String(err);
      if (errStr.includes('403') && errStr.includes('quotaExceeded')) {
        console.error(`YouTube API quota exceeded after ${queriesRun} queries. Stopping.`);
        break;
      }
      console.warn(`Query "${query}" failed: ${errStr}`);
    }
  }

  // Dedupe channels
  const uniqueChannels = new Map<string, ChannelCandidate>();
  for (const c of channelCandidates) uniqueChannels.set(c.id, c);

  console.log(`\nResults: ${queriesRun} queries → ${uniqueChannels.size} unique channels (videos fetched later by backfill-ingest)`);

  if (dryRun) {
    console.log('DRY RUN — no DB writes');
    return;
  }

  const channelsAdded = await bulkInsertChannels(db, [...uniqueChannels.values()]);

  console.log(`DB writes: ${channelsAdded} new channels seeded`);
}

main().catch(err => { console.error(err); process.exit(1); });
