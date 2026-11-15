// Ranks known channels (D1 channels + videos tables) by YouTube total views, 1 quota unit per 50 channels.
// Writes state/creator-queue.json: channels with 100+ uploads not yet built, biggest first. Reads only; no D1 writes.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
for (const l of readFileSync('.env', 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i)]) process.env[l.slice(0, i)] = l.slice(i + 1).replace(/^["']|["']$/g, '').trim(); }
const KEY = process.env.YOUTUBE_API_KEY;
const out = execSync(`npx wrangler d1 execute asmr-registry --remote --json --command "SELECT id FROM channels UNION SELECT DISTINCT channel_id FROM videos WHERE channel_id IS NOT NULL"`, { encoding: 'utf8', maxBuffer: 64e6 });
const ids = [...new Set(JSON.parse(out)[0].results.map((r) => r.id).filter((x) => /^UC[\w-]{22}$/.test(x)))];
const built = new Set(existsSync('public/creator-data') ? readdirSync('public/creator-data').map((f) => JSON.parse(readFileSync(`public/creator-data/${f}`, 'utf8')).channel?.id) : []);
const rows = []; let units = 0;
for (let i = 0; i < ids.length; i += 50) {
  const r = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ids.slice(i, i + 50).join(',')}&key=${KEY}`)).json(); units++;
  for (const c of r.items || []) rows.push({ id: c.id, title: c.snippet.title, views: +c.statistics.viewCount, videos: +c.statistics.videoCount });
}
// ASMR channels only (2026-11-15: the channels table also holds Toys and Colors, Baby Shark...): "asmr" in the name,
// or 20+ ASMR-tagged videos of theirs published in our catalog.
const tagged = Object.fromEntries(JSON.parse(execSync(`npx wrangler d1 execute asmr-registry --remote --json --command "SELECT channel_id, COUNT(*) n FROM videos WHERE status='published' AND primary_trigger IS NOT NULL GROUP BY channel_id HAVING n >= 20"`, { encoding: 'utf8', maxBuffer: 64e6 }))[0].results.map((r) => [r.channel_id, r.n]));
const queue = rows.filter((c) => c.videos >= 100 && !built.has(c.id) && (/asmr/i.test(c.title) || tagged[c.id])).sort((a, b) => b.views - a.views);
writeFileSync('state/creator-queue.json', JSON.stringify(queue, null, 1));
console.log(`ranked ${rows.length} channels (${units} units); queue ${queue.length} with 100+ uploads; top 5:`, queue.slice(0, 5).map((c) => `${c.title} (${(c.views / 1e6).toFixed(0)}M views, ${c.videos} videos)`).join('; '));
