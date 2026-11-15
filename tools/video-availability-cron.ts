import { getDb } from '../src/lib/db';

export interface StaleVideo {
  id: string;
  youtube_id: string;
  title: string;
  reason: 'deleted' | 'duration_changed' | 'inactive_creator';
}

async function checkYouTubeVideo(youtubeId: string): Promise<{
  exists: boolean;
  duration?: number;
}> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
    const response = await fetch(url);
    return { exists: response.ok };
  } catch {
    return { exists: false };
  }
}

export async function detectStaleVideos(): Promise<StaleVideo[]> {
  console.log('Detecting stale videos...');
  const client = getDb();

  try {
    // Live DB: id column IS the YouTube ID
    const published = await client.execute('SELECT id, title FROM videos WHERE status = \'published\'');
    const stale: StaleVideo[] = [];

    for (const video of published.rows) {
      const youtubeId = video.id as string;
      const ytCheck = await checkYouTubeVideo(youtubeId);

      if (!ytCheck.exists) {
        stale.push({
          id: youtubeId,
          youtube_id: youtubeId,
          title: video.title as string,
          reason: 'deleted',
        });
      }
    }

    console.log(`Found ${stale.length} stale videos`);

    // Kill-switch: >10% demotion rate
    const staleRate = stale.length / (published.rows.length || 1);
    if (staleRate > 0.1) {
      console.error(`🚨 KILL-SWITCH: ${(staleRate * 100).toFixed(1)}% of videos are stale!`);
      console.error('Pausing new video publishing...');
      process.exit(1);
    }

    // Demote stale videos to draft
    for (const s of stale) {
      await client.execute({ sql: 'UPDATE videos SET status = \'draft\' WHERE id = ?', args: [s.id] });
    }

    return stale;
  } catch (error) {
    console.error('Availability cron failed:', error);
    return [];
  }
}

export async function runAvailabilityCron() {
  await detectStaleVideos();
}
