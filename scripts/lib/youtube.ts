// scripts/lib/youtube.ts — YouTube Data API v3 helpers for local backfill scripts.
// Mirrors cron-worker/src/lib/youtube.ts but runs in Node (no Worker constraints).
const BASE = 'https://www.googleapis.com/youtube/v3';

export interface SearchItem {
  id: { videoId: string };
  snippet: { channelId: string; channelTitle: string; title: string; publishedAt: string; description: string };
}

interface SearchResult {
  items: SearchItem[];
  nextPageToken?: string;
  pageInfo?: { totalResults: number };
}

interface VideoItem {
  id: string;
  snippet: { channelId: string; channelTitle: string; title: string; publishedAt: string; description: string };
  contentDetails: { duration: string };
  statistics: { viewCount: string };
}

interface VideoResult { items: VideoItem[]; }

interface PlaylistItem { snippet: { resourceId: { videoId: string } }; }
interface PlaylistResult { items: PlaylistItem[]; nextPageToken?: string; }

interface ChannelItem { id: string; snippet: { title: string }; statistics: { videoCount: string }; }
interface ChannelResult { items: ChannelItem[]; }

export async function searchVideos(apiKey: string, query: string, maxResults = 50, pageToken?: string): Promise<SearchResult> {
  const params = new URLSearchParams({
    part: 'snippet', q: query, type: 'video', order: 'viewCount',
    maxResults: String(maxResults), key: apiKey,
  });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) throw new Error(`YouTube search failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<SearchResult>;
}

export async function searchChannels(apiKey: string, query: string, maxResults = 50): Promise<{ items: Array<{ id: { channelId: string }; snippet: { title: string } }> }> {
  const params = new URLSearchParams({
    part: 'snippet', q: query, type: 'channel', order: 'relevance',
    maxResults: String(maxResults), key: apiKey,
  });
  const res = await fetch(`${BASE}/search?${params}`);
  if (!res.ok) throw new Error(`YouTube channel search failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getVideoDetails(apiKey: string, ids: string[]): Promise<VideoResult> {
  const params = new URLSearchParams({
    part: 'snippet,contentDetails,statistics', id: ids.join(','), key: apiKey,
  });
  const res = await fetch(`${BASE}/videos?${params}`);
  if (!res.ok) throw new Error(`YouTube videos.list failed: ${res.status}`);
  return res.json() as Promise<VideoResult>;
}

export async function getPlaylistItems(apiKey: string, playlistId: string, pageToken?: string): Promise<PlaylistResult> {
  const params = new URLSearchParams({
    part: 'snippet', playlistId, maxResults: '50', key: apiKey,
  });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetch(`${BASE}/playlistItems?${params}`);
  if (!res.ok) throw new Error(`YouTube playlistItems failed: ${res.status}`);
  return res.json() as Promise<PlaylistResult>;
}

export async function getChannelDetails(apiKey: string, ids: string[]): Promise<ChannelResult> {
  const params = new URLSearchParams({
    part: 'snippet,statistics', id: ids.join(','), key: apiKey,
  });
  const res = await fetch(`${BASE}/channels?${params}`);
  if (!res.ok) throw new Error(`YouTube channels.list failed: ${res.status}`);
  return res.json() as Promise<ChannelResult>;
}

export function parseDuration(iso8601: string | undefined): number {
  if (!iso8601) return 0;
  const match = iso8601.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0') * 3600) + (parseInt(match[2] || '0') * 60) + parseInt(match[3] || '0');
}
