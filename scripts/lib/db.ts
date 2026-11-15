// scripts/lib/db.ts — D1 REST API adapter for local scripts + CI
import 'dotenv/config';

const ACCOUNT_ID = '175119c9cdd3c5d253a685ce56080b8c';
const DATABASE_ID = '4f8937a1-9629-4c8b-a343-9cfe238cc319';

interface D1Row { [key: string]: any }
interface D1Result { rows: D1Row[]; columns: string[] }

class D1RestAdapter {
  private apiToken: string;
  private baseUrl: string;

  constructor() {
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
    if (!this.apiToken) { console.error('Missing CLOUDFLARE_API_TOKEN in .env'); process.exit(1); }
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
  }

  async execute(query: string | { sql: string; args?: any[] }): Promise<D1Result> {
    const sql = typeof query === 'string' ? query : query.sql;
    const params = typeof query === 'string' ? [] : (query.args ?? []);
    const resp = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    const json = await resp.json() as any;
    if (!json.success) throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`);
    const result = json.result?.[0] ?? { results: [] };
    return {
      rows: result.results ?? [],
      columns: result.results?.length ? Object.keys(result.results[0]) : [],
    };
  }

  async batch(stmts: Array<{ sql: string; args?: any[] }>, _mode?: string): Promise<D1Result[]> {
    const results: D1Result[] = [];
    for (const stmt of stmts) {
      results.push(await this.execute({ sql: stmt.sql, args: stmt.args }));
    }
    return results;
  }
}

export type Client = D1RestAdapter;

export function getDb(): D1RestAdapter {
  return new D1RestAdapter();
}

export interface IngestCandidate {
  id: string; title: string; channelId: string; channelName: string;
  duration: number; viewCount: number; publishDate: string; description: string;
}

export interface ChannelCandidate { id: string; name: string; }

function generateChannelSlug(name: string, fallbackId: string): string {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug.length < 2) slug = fallbackId;
  return slug;
}

export async function bulkInsertIngestQueue(db: D1RestAdapter, candidates: IngestCandidate[]): Promise<number> {
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

  const fresh = ids.filter(id => !existing.has(id)).map(id => byId.get(id)!);
  if (fresh.length === 0) return 0;

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

export async function bulkInsertChannels(db: D1RestAdapter, candidates: ChannelCandidate[]): Promise<number> {
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
