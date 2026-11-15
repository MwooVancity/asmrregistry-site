// ASMR streams live on YouTube right now, for /live-asmr/. safeSearch strict returns 0 live streams (2026-11-11), so moderate plus our SUGGESTIVE filter. One search.list call (100 quota units) every 3 hours
// = 800 units a day. Suggestive titles are dropped with the same rule the site uses for creators. The single row
// is overwritten each run, so stored YouTube data is never older than 3 hours (30-day rule).
import type { D1Adapter } from '../d1-adapter';
import { SUGGESTIVE, CLAIM } from '../../../scripts/lib/creator-gate-lib.mjs';

// The API returns titles HTML-encoded (&amp;, &#39;); store plain text, the page escapes on output.
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
// Same promise filter as the best-of sleep lists: no "99% fall asleep" style titles.
const PROMISE = /\d\s?%/;

export async function runLiveNow(db: D1Adapter, apiKey: string) {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.search = new URLSearchParams({ part: 'snippet', q: 'asmr', eventType: 'live', type: 'video', order: 'viewCount', safeSearch: 'moderate', maxResults: '25', key: apiKey }).toString();
  const r = await fetch(u);
  if (!r.ok) throw new Error(`live search ${r.status}`);
  const data: any = await r.json();
  const items = (data.items ?? [])
    .map((i: any) => ({ id: i.id?.videoId, t: decode(i.snippet?.title ?? ''), c: decode(i.snippet?.channelTitle ?? '') }))
    .filter((v: any) => /^[\w-]{11}$/.test(v.id) && !SUGGESTIVE.test(v.t) && !CLAIM.test(v.t) && !PROMISE.test(v.t))
    .slice(0, 12);
  await db.execute({ sql: 'INSERT OR REPLACE INTO live_now (id, json, fetched_at) VALUES (1, ?, ?)', args: [JSON.stringify(items), new Date().toISOString()] });
  return { found: data.items?.length ?? 0, kept: items.length };
}
