// Funnel priority creators into the catalog: fetch uploads, classify locally (no Worker subrequest cap), insert.
// Same classification + publish rules as cron-worker/src/stages/enrich-batch.ts, minus the daily drip cap.
// Priority channels = channels.last_updated = '2000-01-01' (set when queued for creator pages).
// Usage: npx tsx scripts/funnel-creators.ts [maxPerChannel=200] [maxChannels=99]
import 'dotenv/config';
import { getDb } from './lib/db';
import { callDeepSeek, validateEnrichment, matchTriggers, bucketFromSeconds } from './lib/enrichment';
import { TRIGGER_KEYWORDS } from '../cron-worker/src/constants';

const MAX_PER = Number(process.argv[2] || 200);
const MAX_CH = Number(process.argv[3] || 99);
const YT = process.env.YOUTUBE_API_KEY!;
const DS = process.env.DEEPSEEK_API_KEY!;
if (!YT || !DS) throw new Error('YOUTUBE_API_KEY and DEEPSEEK_API_KEY required in .env');

const iso = (d: string) => { const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0; };
async function yt(path: string) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${YT}`);
  const j: any = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}

const db = getDb();
const chans = (await db.execute(`SELECT id, name FROM channels WHERE last_updated = '2000-01-01' LIMIT ${MAX_CH}`)).rows as any[];
console.log(`priority channels: ${chans.length}`);
let totalNew = 0, totalPub = 0, totalFail = 0;

for (const ch of chans) {
  const ids: string[] = []; let token = '';
  try {
    do {
      const p = await yt(`playlistItems?part=contentDetails&maxResults=50&playlistId=UU${(ch.id as string).slice(2)}${token ? '&pageToken=' + token : ''}`);
      for (const it of p.items || []) ids.push(it.contentDetails.videoId);
      token = p.nextPageToken || '';
    } while (token && ids.length < MAX_PER);
  } catch (e: any) { console.log(`${ch.name}: playlist error ${e.message}`); continue; }

  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90); const ph = part.map(() => '?').join(',');
    for (const r of (await db.execute({ sql: `SELECT id FROM videos WHERE id IN (${ph})`, args: part })).rows) known.add(r.id as string);
  }
  const fresh = ids.slice(0, MAX_PER).filter(id => !known.has(id));

  const rows: any[] = [];
  for (let i = 0; i < fresh.length; i += 50) {
    const v = await yt(`videos?part=snippet,contentDetails,statistics&id=${fresh.slice(i, i + 50).join(',')}`);
    for (const it of v.items || []) rows.push({
      id: it.id, raw_title: it.snippet.title, raw_channel_id: it.snippet.channelId, raw_channel_name: it.snippet.channelTitle,
      raw_duration_seconds: iso(it.contentDetails.duration), raw_view_count: Number(it.statistics?.viewCount || 0),
      raw_publish_date: it.snippet.publishedAt, raw_description: (it.snippet.description || '').slice(0, 1000),
    });
  }

  let pub = 0, fail = 0;
  for (let i = 0; i < rows.length; i += 8) {
    await Promise.all(rows.slice(i, i + 8).map(async (row) => {
      if (row.raw_duration_seconds > 0 && row.raw_duration_seconds < 300) { fail++; return; } // shorts, same as worker
      try {
        const { valid, normalized } = validateEnrichment(await callDeepSeek(DS, row));
        if (!valid) { fail++; return; }
        const trig = matchTriggers(row.raw_title, row.raw_description);
        // Keyword triggers win when they match; otherwise keep the classifier's own answer (the worker blanks it).
        if (trig.length) { normalized.triggers = trig; normalized.primary_trigger = trig[0]; }
        else { normalized.triggers = (normalized.triggers ?? []).filter((t: string) => t in TRIGGER_KEYWORDS); if (!(normalized.primary_trigger in TRIGGER_KEYWORDS)) normalized.primary_trigger = normalized.triggers[0] ?? ''; }
        if (row.raw_duration_seconds > 0) normalized.duration_bucket = bucketFromSeconds(row.raw_duration_seconds);
        const status = normalized.confidence >= 0.7 && normalized.is_asmr ? 'published' : (normalized.is_asmr ? 'draft' : 'rejected');
        if (status === 'published') pub++;
        await db.execute({
          sql: `INSERT OR IGNORE INTO videos (id, title, channel_id, channel_name, duration_seconds, publish_date, view_count, primary_trigger, triggers, intents, intensity, language, format, modifiers, duration_bucket, roleplay_scenario, confidence, is_asmr, status, why_watch, created_at, last_synchronized)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          args: [row.id, row.raw_title, row.raw_channel_id, row.raw_channel_name, row.raw_duration_seconds, row.raw_publish_date, row.raw_view_count, normalized.primary_trigger, JSON.stringify(normalized.triggers), JSON.stringify(normalized.intents), normalized.intensity, normalized.language, normalized.format, JSON.stringify(normalized.modifiers), normalized.duration_bucket, normalized.roleplay_scenario, normalized.confidence, normalized.is_asmr, status, normalized.why_watch ?? null],
        });
      } catch { fail++; }
    }));
  }
  await db.execute({ sql: `UPDATE channels SET status = 'active', last_updated = datetime('now'), video_count = ? WHERE id = ?`, args: [known.size + pub, ch.id] });
  totalNew += rows.length; totalPub += pub; totalFail += fail;
  console.log(`${ch.name}: uploads ${ids.length}, new ${rows.length}, published ${pub}, failed/short ${fail}`);
}
console.log(`DONE channels ${chans.length} | new ${totalNew} | published ${totalPub} | failed ${totalFail}`);
