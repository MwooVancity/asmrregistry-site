// cron-worker/src/stages/pillar-seed.ts
// On each pillar's publishDate, runs its targeted youtubeQuery to seed
// relevant videos into the ingest queue before the page goes live.
import type { Client } from '../d1-adapter';
import { searchVideos, getVideoDetails, parseDuration } from '../lib/youtube';
import { bulkInsertIngestQueue, bulkInsertChannels, getCronState, type IngestCandidate, type ChannelCandidate } from '../lib/helpers';

interface PillarMeta {
  slug: string;
  publishDate: string;
  youtubeQuery: string;
}

// Mirrors src/lib/pillar-schedule.ts — kept inline to avoid cross-package imports
const PILLAR_SCHEDULE: PillarMeta[] = [
  { slug: 'what-is-asmr',        publishDate: '2026-06-01', youtubeQuery: 'what is ASMR explained beginner guide' },
  { slug: 'asmr-science',         publishDate: '2026-06-01', youtubeQuery: 'ASMR brain neuroscience research study' },
  { slug: 'asmr-statistics',      publishDate: '2026-06-01', youtubeQuery: 'most popular ASMR videos all time' },
  { slug: 'asmr-history',         publishDate: '2026-06-02', youtubeQuery: 'ASMR history original videos 2009 2010' },
  { slug: 'asmr-triggers',        publishDate: '2026-06-02', youtubeQuery: 'ASMR all triggers compilation best' },
  { slug: 'does-asmr-work',       publishDate: '2026-06-02', youtubeQuery: 'ASMR actually works science proven' },
  { slug: 'asmr-vs-meditation',   publishDate: '2026-06-03', youtubeQuery: 'ASMR meditation mindfulness relaxation' },
  { slug: 'best-asmr-for-sleep',  publishDate: '2026-06-03', youtubeQuery: 'best ASMR sleep fall asleep fast 2024' },
  { slug: 'asmr-for-anxiety',     publishDate: '2026-06-03', youtubeQuery: 'ASMR anxiety relief calming panic' },
  { slug: 'asmr-for-studying',    publishDate: '2026-06-04', youtubeQuery: 'ASMR studying focus productivity background' },
  { slug: 'asmr-for-insomnia',    publishDate: '2026-06-04', youtubeQuery: 'ASMR insomnia chronic sleep help overnight' },
  { slug: 'asmr-tingles',         publishDate: '2026-06-04', youtubeQuery: 'ASMR intense tingles spine chills' },
  { slug: 'long-asmr-videos',     publishDate: '2026-06-05', youtubeQuery: 'ASMR 8 hours overnight sleep looped' },
  { slug: 'asmr-for-adhd',        publishDate: '2026-06-05', youtubeQuery: 'ASMR ADHD focus background noise concentration' },
  { slug: 'tapping-asmr',         publishDate: '2026-06-05', youtubeQuery: 'tapping ASMR nails glass wood satisfying' },
  { slug: 'whispering-asmr',      publishDate: '2026-06-06', youtubeQuery: 'whispering ASMR soft spoken close ear' },
  { slug: 'rain-asmr',            publishDate: '2026-06-06', youtubeQuery: 'rain ASMR falling asleep thunder window' },
  { slug: 'binaural-asmr',        publishDate: '2026-06-06', youtubeQuery: 'binaural ASMR 3D audio headphones intense' },
  { slug: 'eating-asmr',          publishDate: '2026-06-07', youtubeQuery: 'ASMR eating sounds mukbang crunchy' },
  { slug: 'no-talking-asmr',      publishDate: '2026-06-07', youtubeQuery: 'ASMR no talking pure sounds ambient' },
  { slug: 'nature-asmr',          publishDate: '2026-06-07', youtubeQuery: 'nature sounds ASMR forest rain birds ocean' },
  { slug: 'roleplay-asmr',        publishDate: '2026-06-08', youtubeQuery: 'ASMR roleplay doctor spa barber personal attention' },
  { slug: 'korean-asmr',          publishDate: '2026-06-08', youtubeQuery: 'Korean ASMR creators best channels' },
  { slug: 'asmr-for-tinnitus',    publishDate: '2026-06-08', youtubeQuery: 'ASMR tinnitus relief masking white noise' },
  { slug: 'asmr-for-depression',  publishDate: '2026-06-09', youtubeQuery: 'ASMR comfort depression sadness caring' },
  { slug: 'soft-speaking-asmr',   publishDate: '2026-06-09', youtubeQuery: 'ASMR soft spoken voice calm soothing' },
  { slug: 'hair-asmr',            publishDate: '2026-06-09', youtubeQuery: 'ASMR hair brushing play scalp tingles' },
  { slug: 'asmr-for-kids',        publishDate: '2026-06-10', youtubeQuery: 'ASMR for kids gentle bedtime calm children' },
  { slug: 'asmr-for-headache',    publishDate: '2026-06-10', youtubeQuery: 'ASMR headache migraine relief gentle' },
  { slug: 'best-asmr-creators',   publishDate: '2026-06-10', youtubeQuery: 'best ASMR YouTubers creators channels 2024' },
];

export async function runPillarSeed(db: Client, youtubeKey: string): Promise<{ pillarsSeeded: number; videosQueued: number }> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const todaysPillars = PILLAR_SCHEDULE.filter(p => p.publishDate === todayIso);
  if (todaysPillars.length === 0) return { pillarsSeeded: 0, videosQueued: 0 };

  let videosQueued = 0;

  for (const pillar of todaysPillars) {
    // Idempotent — skip if already seeded today
    const seededKey = `pillar_seeded_${pillar.slug}`;
    const alreadySeeded = await getCronState(db, seededKey);
    if (alreadySeeded) continue;

    // Search YouTube for targeted videos
    const result = await searchVideos(youtubeKey, pillar.youtubeQuery, 50);
    const videoIds = result.items.map((i: any) => i.id.videoId);

    // Batch fetch full details (duration, viewCount), then bulk-insert once
    if (videoIds.length > 0) {
      const details = await getVideoDetails(youtubeKey, videoIds);
      const videoCandidates: IngestCandidate[] = [];
      const channelCandidates: ChannelCandidate[] = [];
      for (const video of details.items) {
        videoCandidates.push({
          id: video.id, title: video.snippet.title,
          channelId: video.snippet.channelId, channelName: video.snippet.channelTitle,
          duration: parseDuration(video.contentDetails.duration),
          viewCount: parseInt(video.statistics.viewCount || '0'),
          publishDate: video.snippet.publishedAt, description: video.snippet.description,
        });
        channelCandidates.push({ id: video.snippet.channelId, name: video.snippet.channelTitle });
      }
      videosQueued += await bulkInsertIngestQueue(db, videoCandidates);
      await bulkInsertChannels(db, channelCandidates);
    }

    // Mark seeded (use INSERT OR IGNORE so setCronState can be reused)
    await db.execute({
      sql: `INSERT OR IGNORE INTO cron_state (key, value) VALUES (?, datetime('now'))`,
      args: [seededKey],
    });

    console.log(`Pillar seed: '${pillar.slug}' — ${videoIds.length} searched, ${videosQueued} new queued`);
  }

  return { pillarsSeeded: todaysPillars.length, videosQueued };
}
