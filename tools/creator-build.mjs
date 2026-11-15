// Creator engine v2 (owner 2026-11-15: "Elon fix"): one static JSON per creator, no D1 writes, no AI calls.
// Pulls every upload of a channel (uploads playlist + videos.list, ~1 quota unit per 50 videos), computes the page's
// facts, and writes public/creator-data/<slug>.json. Refresh = run again (YouTube 30-day rule).
//   node tools/creator-build.mjs <channelId> [<channelId> ...]   [--budget 6000]
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { SUGGESTIVE, TRIG } from '../scripts/lib/creator-gate-lib.mjs'; // TRIG: title trigger rules, no AI

for (const l of (existsSync('.env') ? readFileSync('.env', 'utf8') : '').split(/\r?\n/)) {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).replace(/^["']|["']$/g, '').trim();
}
const KEY = process.env.YOUTUBE_API_KEY;
const args = process.argv.slice(2);
const budget = args.includes('--budget') ? Number(args[args.indexOf('--budget') + 1]) : 6000;
const ids = args.filter((a, i) => /^UC[\w-]{22}$/.test(a) && args[i - 1] !== '--budget');
const OUT = 'public/creator-data';
const OLD = existsSync('src/lib/creators-data.json') ? JSON.parse(readFileSync('src/lib/creators-data.json', 'utf8')) : {};
mkdirSync(OUT, { recursive: true });
let units = 0;
// Channels that never get a page (under 100 videos, or gone). tools/creator-daily.mjs leaves them out of the queue.
const skipForever = (cid) => appendFileSync(`${OUT}/_skipped.txt`, cid + '\n');
const api = async (path) => {
  if (units >= budget) throw new Error(`quota budget ${budget} reached`);
  units++;
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${KEY}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
};
const dur = (s = '') => { const m = s.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || []; return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0); };
const slugify = (t) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function build(cid) {
  const ch = (await api(`channels?part=snippet,statistics,contentDetails&id=${cid}`)).items?.[0];
  if (!ch) throw new Error('channel not found');
  const uploads = ch.contentDetails.relatedPlaylists.uploads;
  const vidIds = [];
  for (let tok = ''; ;) {
    const p = await api(`playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${tok ? `&pageToken=${tok}` : ''}`);
    vidIds.push(...p.items.map((i) => i.contentDetails.videoId));
    if (!p.nextPageToken) break; tok = p.nextPageToken;
  }
  const vids = []; let kids = 0;
  for (let i = 0; i < vidIds.length; i += 50) {
    const r = await api(`videos?part=snippet,contentDetails,statistics,status&id=${vidIds.slice(i, i + 50).join(',')}`);
    for (const v of r.items) {
      if (v.status?.privacyStatus !== 'public' || v.contentDetails?.contentRating?.ytRating === 'ytAgeRestricted') continue;
      if (v.status?.madeForKids) kids++;
      const t = v.snippet.title;
      vids.push({ id: v.id, t, v: v.statistics.viewCount == null ? null : +v.statistics.viewCount, d: dur(v.contentDetails.duration), p: v.snippet.publishedAt.slice(0, 10), blocked: SUGGESTIVE.test(t) });
    }
  }
  const ok = vids.filter((v) => !v.blocked);
  // Owner rule: a creator page needs 100+ videos. Thinner channels are remembered so the queue never retries them.
  // Kids channels (YouTube "made for kids" on most uploads) never get a page: our pages carry adult-capable ads.
  if (kids > vids.length / 2) { skipForever(cid); return { slug: '(skipped, made for kids)', uploads: vidIds.length, full: 0, shorts: 0, blocked: 0, top: 0 }; }
  if (ok.length < 100) { skipForever(cid); return { slug: '(skipped, under 100 videos)', uploads: vidIds.length, full: 0, shorts: 0, blocked: 0, top: 0 }; }
  const full = ok.filter((v) => v.d > 180), shorts = ok.filter((v) => v.d > 0 && v.d <= 180);
  const byYear = {}; for (const v of ok) byYear[v.p.slice(0, 4)] = (byYear[v.p.slice(0, 4)] || 0) + 1;
  const trig = {}; for (const v of full) for (const [k, re] of Object.entries(TRIG)) if (re.test(v.t)) trig[k] = (trig[k] || 0) + 1;
  const rank = (a) => [...a].filter((v) => v.v != null).sort((x, y) => y.v - x.v);
  // Full videos first; Shorts-heavy channels (Indian ASMR World: 4 full, 566 Shorts) are topped up with their most
  // viewed Shorts so the page still lists 100.
  const top = [...rank(full), ...rank(shorts)].slice(0, 100);
  const data = {
    fetched: new Date().toISOString().slice(0, 10),
    channel: { id: cid, title: ch.snippet.title, handle: ch.snippet.customUrl || null, since: ch.snippet.publishedAt.slice(0, 10), subs: ch.statistics.hiddenSubscriberCount ? null : +ch.statistics.subscriberCount, views: +ch.statistics.viewCount },
    counts: { uploads: vidIds.length, public: ok.length, full: full.length, shorts: shorts.length, blocked: vids.length - ok.length },
    lengths: { under10: full.filter((v) => v.d < 600).length, m10to30: full.filter((v) => v.d >= 600 && v.d < 1800).length, m30to60: full.filter((v) => v.d >= 1800 && v.d < 3600).length, over60: full.filter((v) => v.d >= 3600).length, medianMin: Math.round(median(full.map((v) => v.d)) / 60) },
    byYear, triggers: Object.entries(trig).sort((a, b) => b[1] - a[1]).slice(0, 8),
    first: ok.reduce((a, v) => (v.p < a ? v.p : a), '9999'), last: ok.reduce((a, v) => (v.p > a ? v.p : a), '0000'),
    top: top.map(({ id, t, v, d, p }) => ({ id, t, v, d, p })),
    newest: [...full].sort((a, b) => b.p.localeCompare(a.p)).slice(0, 10).map(({ id, t, v, d, p }) => ({ id, t, v, d, p })),
    sleepPick: rank(full.filter((v) => v.d >= 3600)).slice(0, 5).map(({ id, t, v, d, p }) => ({ id, t, v, d, p })),
    // Every public video (owner 2026-11-15: "max out their videos"), most viewed first; Shorts flagged by length.
    all: [...ok].sort((a, b) => (b.v ?? -1) - (a.v ?? -1)).map(({ id, t, v, d, p }) => ({ id, t, v, d, p })),
  };
  // A creator who already has a page keeps its address (one page per creator: asmr-puffin, not a second puffin-asmr).
  const old = Object.entries(OLD).find(([, c]) => c.channelId === cid)?.[0];
  let slug = old || slugify(ch.snippet.title) || cid.toLowerCase();
  if (!/asmr/.test(slug)) slug += '-asmr';
  const prev = existsSync(`${OUT}/${slug}.json`) ? JSON.parse(readFileSync(`${OUT}/${slug}.json`, 'utf8')) : null;
  if (prev && prev.channel?.id !== cid) slug += '-' + cid.slice(-6).toLowerCase(); // two channels, one name
  writeFileSync(`${OUT}/${slug}.json`, JSON.stringify(data));
  return { slug, ...data.counts, top: data.top.length };
}

for (const cid of ids) {
  const before = units;
  try { const r = await build(cid); console.log(`${r.slug}: ${r.uploads} uploads, ${r.full} full + ${r.shorts} shorts, top ${r.top}, ${r.blocked} blocked, ${units - before} units`); }
  // Stop at the first quota error (ours or YouTube's daily limit); tomorrow's run resumes from the queue.
  catch (e) {
    console.log(`${cid}: FAILED ${e.message}`);
    if (/budget|quota/i.test(e.message)) break;
    if (/channel not found/.test(e.message)) skipForever(cid);
  }
}
console.log(`quota used: ${units} of budget ${budget}`);
