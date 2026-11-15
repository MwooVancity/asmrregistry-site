import type { APIRoute } from 'astro';
import { search } from '../lib/search';
import { client } from '../lib/db';

export const GET: APIRoute = async ({ url }) => {
  const videoId = url.searchParams.get('video_id');

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'video_id required' }), { status: 400 });
  }

  try {
    // Get the video
    const videoResult = await client.execute('SELECT * FROM videos WHERE youtube_id = ?', [videoId]);
    if (videoResult.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Video not found' }), { status: 404 });
    }

    const v = videoResult.rows[0];
    const primaryTrigger = v.primary_trigger;
    const intents = JSON.parse(v.intents || '[]');

    // Find similar videos (same trigger, any intent)
    const recommendations = await search('', {
      trigger: primaryTrigger,
      sort: 'authority',
    });

    return new Response(
      JSON.stringify({
        video_id: videoId,
        recommendations: recommendations.filter((r: any) => r.id !== v.id).slice(0, 10),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch recommendations' }), { status: 500 });
  }
};
