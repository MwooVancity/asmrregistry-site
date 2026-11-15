// cron-worker/src/lib/helpers.ts
import type { Client } from '../d1-adapter';

export async function getCronState(db: Client, key: string): Promise<string> {
  const result = await db.execute({ sql: `SELECT value FROM cron_state WHERE key = ?`, args: [key] });
  return (result.rows[0]?.value as string) ?? '';
}

export async function setCronState(db: Client, key: string, value: string): Promise<void> {
  await db.execute({ sql: `UPDATE cron_state SET value = ? WHERE key = ?`, args: [value, key] });
}

export async function insertIfNotExistsIngestQueue(db: Client, videoId: string, title: string, channelId: string, channelName: string, durationSeconds: number, viewCount: number, publishDate: string, description: string): Promise<boolean> {
  // Single round trip: check both tables at once
  const exists = await db.execute({
    sql: `SELECT 1 FROM videos WHERE id = ? UNION ALL SELECT 1 FROM ingest_queue WHERE id = ?`,
    args: [videoId, videoId],
  });
  if (exists.rows.length > 0) return false;
  if ((await queueRoom(db)) <= 0) return false; // same daily cap as the bulk path
  await noteQueued(db, 1);
  await db.execute({
    sql: `INSERT INTO ingest_queue (id, raw_title, raw_channel_id, raw_channel_name, raw_duration_seconds, raw_view_count, raw_publish_date, raw_description, processing_status, queued_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    args: [videoId, title, channelId, channelName, durationSeconds, viewCount, publishDate, description],
  });
  return true;
}

export async function insertIfNotExistsChannel(db: Client, channelId: string, channelName: string): Promise<boolean> {
  const exists = await db.execute({ sql: `SELECT 1 FROM channels WHERE id = ?`, args: [channelId] });
  if (exists.rows.length > 0) return false;
  // Use channelId suffix to guarantee unique slugs
  const slug = generateChannelSlug(channelName, channelId) + '-' + channelId.slice(-6);
  try {
    await db.execute({
      sql: `INSERT INTO channels (id, name, slug, status, last_updated) VALUES (?, ?, ?, 'pending_ingestion', datetime('now'))`,
      args: [channelId, channelName, slug],
    });
    return true;
  } catch {
    // Slug collision despite suffix — skip silently
    return false;
  }
}

function generateChannelSlug(name: string, fallbackId: string): string {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug.length < 2) slug = fallbackId;
  return slug;
}

// === Bulk insert helpers ===
// The per-row insertIfNotExists* helpers above issue 2-4 db.execute() calls PER
// ROW. In a Cloudflare Worker, every db.execute() is a subrequest, and a single
// invocation is capped (50 free / 1000 paid). A taxonomy run over 15 queries ×
// 50 results = 750 rows would burn ~2000+ subrequests and abort mid-run. These
// bulk variants collapse the work to ~1 existence SELECT + ~1 batched INSERT per
// ~100-row chunk (a db.batch is a single subrequest regardless of statement
// count), so an entire discovery stage costs a handful of subrequests.

// Intake cap shared by every path that adds to ingest_queue. Counter in cron_state, keyed by UTC date (the same
// clock as Cloudflare's daily D1 limit). One read and one write per batch, not per video.
export const QUEUE_DAILY_CAP = 1500;
const capKey = () => `queue_added_${new Date().toISOString().slice(0, 10)}`;
export async function queueRoom(db: Client): Promise<number> {
  return QUEUE_DAILY_CAP - (parseInt(await getCronState(db, capKey()), 10) || 0);
}
export async function noteQueued(db: Client, n: number): Promise<void> {
  if (n <= 0) return;
  const used = parseInt(await getCronState(db, capKey()), 10) || 0;
  // setCronState only updates an existing key; a new day's key must be inserted.
  await db.execute({ sql: `INSERT OR REPLACE INTO cron_state (key, value) VALUES (?, ?)`, args: [capKey(), String(used + n)] });
}

export interface IngestCandidate {
  id: string; title: string; channelId: string; channelName: string;
  duration: number; viewCount: number; publishDate: string; description: string;
}

// De-dupes by id, filters out anything already in videos/ingest_queue with one
// chunked existence query, then batch-inserts the fresh rows. Returns count added.
export async function bulkInsertIngestQueue(db: Client, candidates: IngestCandidate[]): Promise<number> {
  const byId = new Map<string, IngestCandidate>();
  for (const c of candidates) if (c.id) byId.set(c.id, c);
  const ids = [...byId.keys()];
  if (ids.length === 0) return 0;

  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const ph = chunk.map(() => '?').join(',');
    const r = await db.execute({
      sql: `SELECT id FROM videos WHERE id IN (${ph}) UNION SELECT id FROM ingest_queue WHERE id IN (${ph})`,
      args: [...chunk, ...chunk],
    });
    for (const row of r.rows) existing.add(row.id as string);
  }

  let fresh = ids.filter(id => !existing.has(id)).map(id => byId.get(id)!);
  if (fresh.length === 0) return 0;
  // Daily intake cap (2026-11-13: 18,657 rows queued in a day against ~0 processed, 64K pending; each queued row
  // costs 4 D1 writes in and 4 when purged, and blew the 100K/day free limit). Newest uploads keep their place.
  const room = await queueRoom(db);
  if (room <= 0) return 0;
  fresh = fresh.sort((a, b) => String(b.publishDate).localeCompare(String(a.publishDate))).slice(0, room);
  await noteQueued(db, fresh.length);

  const stmts = fresh.map(c => ({
    sql: `INSERT OR IGNORE INTO ingest_queue (id, raw_title, raw_channel_id, raw_channel_name, raw_duration_seconds, raw_view_count, raw_publish_date, raw_description, processing_status, queued_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    args: [c.id, c.title, c.channelId, c.channelName, c.duration, c.viewCount, c.publishDate, c.description] as any[],
  }));
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100), 'write');
  }
  return fresh.length;
}

export interface ChannelCandidate { id: string; name: string; }

// De-dupes by id, filters out existing channels with one chunked existence query,
// then batch-inserts. INSERT OR IGNORE makes the batch safe against PK and slug
// UNIQUE collisions (the offending row is skipped, the batch doesn't roll back).
export async function bulkInsertChannels(db: Client, candidates: ChannelCandidate[]): Promise<number> {
  const byId = new Map<string, ChannelCandidate>();
  for (const c of candidates) if (c.id) byId.set(c.id, c);
  const ids = [...byId.keys()];
  if (ids.length === 0) return 0;

  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const ph = chunk.map(() => '?').join(',');
    const r = await db.execute({ sql: `SELECT id FROM channels WHERE id IN (${ph})`, args: chunk });
    for (const row of r.rows) existing.add(row.id as string);
  }

  const fresh = ids.filter(id => !existing.has(id)).map(id => byId.get(id)!);
  if (fresh.length === 0) return 0;

  const stmts = fresh.map(c => {
    const slug = generateChannelSlug(c.name, c.id) + '-' + c.id.slice(-6);
    return {
      sql: `INSERT OR IGNORE INTO channels (id, name, slug, status, last_updated) VALUES (?, ?, ?, 'pending_ingestion', datetime('now'))`,
      args: [c.id, c.name, slug] as any[],
    };
  });
  for (let i = 0; i < stmts.length; i += 100) {
    await db.batch(stmts.slice(i, i + 100), 'write');
  }
  return fresh.length;
}
