// Merges a JSON list of channel IDs into state/creator-queue.json (1 quota unit per 50 IDs, hard stop at 1,000 units).
// Usage: node tools/creator-rank-ids.mjs [ids.json]   (default state/dataset-channel-ids.json)
// Keeps 100+ video channels not already queued or built, sorted by total views; FRONT handles go first.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
for (const l of readFileSync('.env', 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).replace(/^["']|["']$/g, '').trim(); }
const KEY = process.env.YOUTUBE_API_KEY;
const FRONT = ['@FrivolousFoxASMR', '@ASMRPlayroom', '@ASMRDarling', '@PierreGASMR'];
const CAP = 1000;
const src = process.argv[2] || 'state/dataset-channel-ids.json';

let ids;
try { ids = JSON.parse(readFileSync(src, 'utf8')); } catch (e) { console.error(`input ${src} missing or not JSON (${e.message}); queue untouched`); process.exit(1); }
if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) { console.error(`input ${src} is not a plain list of strings; queue untouched`); process.exit(1); }
const bad = ids.filter((x) => !/^UC[\w-]{22}$/.test(x));
if (bad.length) console.warn(`skipping ${bad.length} non-channel IDs, e.g. ${bad.slice(0, 3).join(', ')}`);
ids = [...new Set(ids.filter((x) => /^UC[\w-]{22}$/.test(x)))];

const queue = JSON.parse(readFileSync('state/creator-queue.json', 'utf8'));
const built = new Set(existsSync('public/creator-data') ? readdirSync('public/creator-data').filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(`public/creator-data/${f}`, 'utf8')).channel?.id) : []);
const known = new Set([...queue.map((c) => c.id), ...built]);
const row = (c) => ({ id: c.id, title: c.snippet.title, views: +c.statistics.viewCount, videos: +c.statistics.videoCount });
let units = 0, stopped = '';
const api = async (q) => {
  if (units >= CAP) { stopped = 'unit cap'; return null; }
  units++;
  const r = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${q}&key=${KEY}`)).json();
  if (r.error) { stopped = `API error: ${r.error.message}`; return null; }
  return r.items || [];
};

// Front channels by handle (1 unit each). Already queued = moved to front; already built = skipped.
const front = [];
for (const h of FRONT) {
  const items = await api(`forHandle=${encodeURIComponent(h)}`);
  if (!items) break;
  if (!items[0]) { console.log(`${h}: not found, skipped`); continue; }
  if (built.has(items[0].id)) { console.log(`${h}: already built, skipped`); continue; }
  front.push(row(items[0])); console.log(`${h}: ${items[0].snippet.title} (${items[0].statistics.videoCount} videos)`);
}

const fresh = ids.filter((x) => !known.has(x));
const added = [];
for (let i = 0; i < fresh.length && !stopped; i += 50) {
  const items = await api(`id=${fresh.slice(i, i + 50).join(',')}`);
  if (!items) break;
  for (const c of items) if (+c.statistics.videoCount >= 100) added.push(row(c));
}

// Budget hit or API error: still save what was merged.
const frontIds = new Set(front.map((c) => c.id));
const rest = [...queue, ...added].filter((c) => !frontIds.has(c.id)).sort((a, b) => b.views - a.views);
const out = [...front, ...rest];
writeFileSync('state/creator-queue.json', JSON.stringify(out, null, 1));
console.log(`dataset IDs ${ids.length}, new ${fresh.length}, kept (100+ videos) ${added.length}, front ${front.length}; queue ${queue.length} -> ${out.length}; units ${units}${stopped ? `; stopped: ${stopped}` : ''}`);
