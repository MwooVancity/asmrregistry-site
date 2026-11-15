// Discover ASMR channels via YouTube search and append new ones to state/creator-queue.json
// after the first 10 entries. Costs: search.list = 100 units, channels.list = 1 unit.
// Hard caps: 100 search calls, 1,500 units total (so in practice ~14 searches per run).
import fs from 'node:fs';
import { SUGGESTIVE } from '../scripts/lib/creator-gate-lib.mjs';

const ROOT = new URL('..', import.meta.url);
const QUEUE = new URL('state/creator-queue.json', ROOT);
const BUILT_DIR = new URL('public/creator-data/', ROOT);
const MAX_SEARCH = 100, MAX_UNITS = 1500;

const env = fs.existsSync(new URL('.env', ROOT)) ? fs.readFileSync(new URL('.env', ROOT), 'utf8') : '';
const KEY = process.env.YOUTUBE_API_KEY || (env.match(/^YOUTUBE_API_KEY\s*=\s*"?([^"\r\n]+)/m) || [])[1];
if (!KEY) { console.error('YOUTUBE_API_KEY missing'); process.exit(1); }

const L = { en: ['en', 'US'], ko: ['ko', 'KR'], ja: ['ja', 'JP'], es: ['es', 'ES'], ru: ['ru', 'RU'] };
// ponytail: ordered so languages interleave; the unit cap stops the run after ~14 searches, rest wait for later runs
const QUERIES = [
  ['asmr whispering', 'en'], ['ASMR 팅글', 'ko'], ['ASMR 囁き', 'ja'], ['ASMR en español', 'es'], ['АСМР', 'ru'],
  ['asmr tapping', 'en'], ['asmr mouth sounds', 'en'], ['먹방 ASMR', 'ko'], ['耳かき ASMR', 'ja'], ['ASMR susurros', 'es'],
  ['АСМР шепот', 'ru'], ['asmr roleplay', 'en'], ['asmr sleep', 'en'], ['asmr no talking', 'en'], ['속삭임 ASMR', 'ko'],
  ['音フェチ ASMR', 'ja'], ['asmr ear cleaning', 'en'], ['asmr ear eating', 'en'], ['asmr kisses', 'en'], ['asmr mukbang', 'en'],
  ['asmr binaural', 'en'], ['asmr boyfriend', 'en'], ['asmr girlfriend', 'en'], ['asmr soft spoken', 'en'],
];
const KIDS = /\b(kids?|children|nursery|baby songs?)\b/i;
const ASMR_TITLE = /asmr|асмр/i;

let calls = 0, units = 0, stopped = '', listFailed = false;
async function api(path, params, cost) {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) u.searchParams.set(k, v);
  units += cost;
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const reason = j.error?.errors?.[0]?.reason || r.status; throw Object.assign(new Error(`${path}: ${reason}`), { reason }); }
  return j;
}

// IDs from a run whose channels.list failed (quota) are saved here and checked first, no new searches
const PENDING = new URL('state/creator-discover-pending.json', ROOT);
const pending = fs.existsSync(PENDING) ? JSON.parse(fs.readFileSync(PENDING, 'utf8')) : [];
const ids = new Set(pending);
// Saved position: each run continues with the next searches instead of repeating the first ones.
const CURSOR = new URL('state/creator-discover-cursor.json', ROOT);
const ALL = ['channel', 'video'].flatMap(type => QUERIES.map(([q, lang]) => [type, q, lang]));
let pos = fs.existsSync(CURSOR) ? (+JSON.parse(fs.readFileSync(CURSOR, 'utf8')).pos || 0) % ALL.length : 0;
if (!pending.length) outer: for (let n = 0; n < ALL.length; n++, pos = (pos + 1) % ALL.length) {
  const [type, q, lang] = ALL[pos];
  // keep room for the channels.list calls the found IDs (plus this search's 50) will need
  if (calls >= MAX_SEARCH || units + 100 + Math.ceil((ids.size + 50) / 50) > MAX_UNITS) { stopped = 'cap'; break outer; }
  calls++;
  try {
    const j = await api('search', { part: 'snippet', type, q, maxResults: 50, safeSearch: 'none', relevanceLanguage: L[lang][0], regionCode: L[lang][1] }, 100);
    for (const it of j.items || []) { const id = it.snippet?.channelId || it.id?.channelId; if (id) ids.add(id); }
  } catch (e) { console.error(e.message); stopped = e.message; break outer; }
}

fs.writeFileSync(CURSOR, JSON.stringify({ pos }));
const queue = JSON.parse(fs.readFileSync(QUEUE, 'utf8'));
const known = new Set(queue.map(c => c.id));
for (const f of fs.readdirSync(BUILT_DIR)) if (f.endsWith('.json')) {
  try { const id = JSON.parse(fs.readFileSync(new URL(f, BUILT_DIR), 'utf8')).channel?.id; if (id) known.add(id); } catch {}
}
const fresh = [...ids].filter(id => !known.has(id));

const kept = [];
for (let i = 0; i < fresh.length; i += 50) {
  if (units + 1 > MAX_UNITS) { stopped ||= 'cap'; break; }
  try {
    const j = await api('channels', { part: 'snippet,statistics', id: fresh.slice(i, i + 50).join(','), maxResults: 50 }, 1);
    for (const c of j.items || []) {
      const t = c.snippet?.title || '', d = c.snippet?.description || '';
      const videos = +c.statistics?.videoCount || 0, views = +c.statistics?.viewCount || 0;
      if (videos < 100 || KIDS.test(t) || SUGGESTIVE.test(t)) continue;
      if (!ASMR_TITLE.test(t) && !/asmr/i.test(d)) continue;
      kept.push({ id: c.id, title: t, views, videos });
    }
  } catch (e) { console.error(e.message); stopped = e.message; listFailed = true; break; }
}
// ponytail: on failure save all fresh IDs; rechecking costs 1 unit per 50 and appended ones drop out as known
if (listFailed || (stopped && stopped !== 'cap')) fs.writeFileSync(PENDING, JSON.stringify(fresh));
else if (fs.existsSync(PENDING)) fs.unlinkSync(PENDING);
kept.sort((a, b) => b.views - a.views);

const out = [...queue.slice(0, 10), ...kept, ...queue.slice(10)];
if (kept.length) fs.writeFileSync(QUEUE, JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ searchCalls: calls, units, stopped: stopped || null, channelsFound: ids.size, newUnknown: fresh.length, kept: kept.length, appended: kept.length, queueBefore: queue.length, queueAfter: kept.length ? out.length : queue.length }));
console.log('top15:\n' + kept.slice(0, 15).map(c => `${c.views}\t${c.videos}\t${c.title}\t${c.id}`).join('\n'));
