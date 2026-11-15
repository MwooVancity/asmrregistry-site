#!/usr/bin/env node
/**
 * rss-ingest.mjs — Free YouTube RSS ingestion. No API key. No quota. No cron.
 *
 * Each YouTube channel exposes a free Atom feed (15 latest videos).
 * We fetch all channels from D1, pull their feeds in parallel, bulk-insert new
 * videos into ingest_queue. Existing pipeline (enrich → publish) takes it from there.
 *
 * Usage:
 *   node tools/rss-ingest.mjs              # all channels
 *   node tools/rss-ingest.mjs --limit 500  # first N channels
 *   node tools/rss-ingest.mjs --concurrency 30
 *
 * Run from PowerShell whenever you want. No cron needed.
 */

import 'dotenv/config';
import { parseStringPromise } from 'xml2js';

const ACCOUNT_ID = '175119c9cdd3c5d253a685ce56080b8c';
const DATABASE_ID = '4f8937a1-9629-4c8b-a343-9cfe238cc319';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
if (!API_TOKEN) { console.error('Missing CLOUDFLARE_API_TOKEN in .env'); process.exit(1); }

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
const RSS_BASE = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

const args = process.argv.slice(2);
const limit = parseInt(args[args.indexOf('--limit') + 1] || '999999');
const concurrency = parseInt(args[args.indexOf('--concurrency') + 1] || '20');

async function d1(sql, params = []) {
  const r = await fetch(D1_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`D1: ${JSON.stringify(j.errors)}`);
  return j.result?.[0]?.results ?? [];
}

async function d1Batch(stmts) {
  // D1 REST batch: split into chunks of 100
  for (let i = 0; i < stmts.length; i += 100) {
    const chunk = stmts.slice(i, i + 100);
    const r = await fetch(D1_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map(s => ({ sql: s.sql, params: s.args }))),
    });
    const j = await r.json();
    if (!j.success) throw new Error(`D1 batch: ${JSON.stringify(j.errors)}`);
  }
}

async function fetchRSS(channelId) {
  try {
    const r = await fetch(RSS_BASE + channelId, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return [];
    const xml = await r.text();
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const entries = parsed?.feed?.entry;
    if (!entries) return [];
    const items = Array.isArray(entries) ? entries : [entries];
    return items.map(e => ({
      id: e['yt:videoId'] || e.id?.replace?.('yt:video:', '') || '',
      title: e.title?._ || e.title || '',
      channelId,
      channelName: e.author?.name || '',
      publishDate: e.published || '',
      viewCount: parseInt(e['media:group']?.['media:community']?.['media:statistics']?.$.views || '0'),
      duration: 0, // RSS doesn't include duration; enrich step fills it
      description: e['media:group']?.['media:description'] || '',
    })).filter(v => v.id);
  } catch {
    return [];
  }
}

async function pool(items, fn, size) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const res = await Promise.all(batch.map(fn));
    results.push(...res);
    process.stdout.write(`\r  fetched ${Math.min(i + size, items.length)}/${items.length} channels`);
  }
  console.log();
  return results;
}

async function main() {
  console.log('RSS Ingest — free, no API key\n');

  const channels = await d1(
    `SELECT id, name FROM channels WHERE status != 'banned' LIMIT ?`,
    [limit]
  );
  console.log(`Channels: ${channels.length}`);

  console.log('Fetching RSS feeds...');
  const allVideos = (await pool(channels, ch => fetchRSS(ch.id), concurrency)).flat();
  console.log(`Raw videos from RSS: ${allVideos.length}`);

  if (allVideos.length === 0) { console.log('Nothing to insert.'); return; }

  // Dedup check against existing videos + ingest_queue
  const ids = [...new Set(allVideos.map(v => v.id))];
  const existing = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    const rows = await d1(
      `SELECT id FROM videos WHERE id IN (${ph}) UNION SELECT id FROM ingest_queue WHERE id IN (${ph})`,
      [...chunk, ...chunk]
    );
    for (const r of rows) existing.add(r.id);
  }

  const fresh = allVideos.filter(v => !existing.has(v.id));
  console.log(`New (not in DB): ${fresh.length}`);
  if (fresh.length === 0) { console.log('All already ingested.'); return; }

  const stmts = fresh.map(v => ({
    sql: `INSERT OR IGNORE INTO ingest_queue
          (id, raw_title, raw_channel_id, raw_channel_name, raw_duration_seconds, raw_view_count, raw_publish_date, raw_description, processing_status, queued_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    args: [v.id, v.title, v.channelId, v.channelName, v.duration, v.viewCount, v.publishDate, v.description],
  }));

  console.log(`Inserting ${stmts.length} videos into ingest_queue...`);
  await d1Batch(stmts);
  console.log(`Done. ${stmts.length} queued.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
