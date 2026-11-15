// cron-worker/src/lib/youtube.ts

interface YouTubeSearchResult {
  items: Array<{
    id: { videoId: string };
    snippet: { channelId: string; channelTitle: string; title: string; publishedAt: string; description: string };
  }>;
  nextPageToken?: string;
}

interface YouTubeVideoResult {
  items: Array<{
    id: string;
    snippet: { channelId: string; channelTitle: string; title: string; publishedAt: string; description: string };
    contentDetails: { duration: string };
    statistics: { viewCount: string };
  }>;
}

interface YouTubePlaylistResult {
  items: Array<{
    snippet: { resourceId: { videoId: string } };
  }>;
  nextPageToken?: string;
}

const BASE = 'https://www.googleapis.com/youtube/v3';

export async function searchVideos(apiKey: string, query: string, maxResults = 50, publishedAfter?: string): Promise<YouTubeSearchResult> {
  const params = new URLSearchParams({
    part: 'snippet', q: query, type: 'video', order: 'viewCount',
    maxResults: String(maxResults), key: apiKey,
  });
  if (publishedAfter) params.set('publishedAfter', publishedAfter);
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) throw new Error(`YouTube search failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getVideoDetails(apiKey: string, ids: string[]): Promise<YouTubeVideoResult> {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics', id: ids.join(','), key: apiKey,
  });
  const res = await fetch(`${BASE}/videos?${params}`);
  if (!res.ok) throw new Error(`YouTube videos.list failed: ${res.status}`);
  return res.json();
}

export async function getPlaylistItems(apiKey: string, playlistId: string, pageToken?: string): Promise<YouTubePlaylistResult> {
  const params = new URLSearchParams({
    part: 'snippet', playlistId, maxResults: '50', key: apiKey,
  });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetch(`${BASE}/playlistItems?${params}`);
  if (!res.ok) throw new Error(`YouTube playlistItems failed: ${res.status}`);
  return res.json();
}

export function parseDuration(iso8601: string | undefined): number {
  if (!iso8601) return 0;
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0') * 3600) + (parseInt(match[2] || '0') * 60) + parseInt(match[3] || '0');
}
