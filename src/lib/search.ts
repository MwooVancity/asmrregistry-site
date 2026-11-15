import { getDb } from './db';

export interface SearchResult {
  id: string;
  youtube_id: string;
  title: string;
  creator_name: string;
  triggers: string[];
  intents: string[];
  authority_score: number;
  rank: number;
}

export async function search(
  query: string,
  filters?: {
    intent?: string;
    trigger?: string;
    duration_min?: number;
    duration_max?: number;
    sort?: 'relevance' | 'views' | 'date' | 'authority';
  }
): Promise<SearchResult[]> {
  const db = getDb();

  let sql = `
    SELECT v.id, v.id as youtube_id, v.title, v.channel_name as creator_name, v.triggers, v.intents, v.view_count as authority_score
    FROM videos v
    WHERE v.status = 'published'
  `;

  const params: any[] = [];

  // Title/channel LIKE search (FTS table not provisioned in live DB)
  if (query && query.trim()) {
    sql += ` AND (v.title LIKE ? OR v.channel_name LIKE ?)`;
    params.push(`%${query.trim()}%`, `%${query.trim()}%`);
  }

  // Filter by intent (JSON array contains)
  if (filters?.intent) {
    sql += ` AND v.intents LIKE ?`;
    params.push(`%"${filters.intent}"%`);
  }

  // Filter by trigger (JSON array contains)
  if (filters?.trigger) {
    sql += ` AND v.triggers LIKE ?`;
    params.push(`%"${filters.trigger}"%`);
  }

  // Filter by duration
  if (filters?.duration_min) {
    sql += ` AND v.duration_seconds >= ?`;
    params.push(filters.duration_min * 60);
  }
  if (filters?.duration_max) {
    sql += ` AND v.duration_seconds <= ?`;
    params.push(filters.duration_max * 60);
  }

  // Sort
  switch (filters?.sort) {
    case 'views':
    case 'authority':
      sql += ` ORDER BY v.view_count DESC`;
      break;
    case 'date':
      sql += ` ORDER BY v.publish_date DESC`;
      break;
    case 'relevance':
    default:
      sql += ` ORDER BY v.view_count DESC, v.publish_date DESC`;
      break;
  }

  sql += ` LIMIT 50`;

  try {
    const results = await db.execute({ sql, args: params });
    return (results.rows as any[]).map((row, rank) => ({
      ...row,
      triggers: JSON.parse(row.triggers || '[]'),
      intents: JSON.parse(row.intents || '[]'),
      rank,
    }));
  } catch (error) {
    console.error('Search query error:', error);
    return [];
  }
}
