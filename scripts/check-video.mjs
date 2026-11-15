import 'dotenv/config';

const ACCOUNT_ID = '175119c9cdd3c5d253a685ce56080b8c';
const DATABASE_ID = '4f8937a1-9629-4c8b-a343-9cfe238cc319';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

async function d1Execute(query) {
  const sql = typeof query === 'string' ? query : query.sql;
  const params = typeof query === 'string' ? [] : (query.args ?? []);
  const resp = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const json = await resp.json();
  if (!json.success) throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`);
  const result = json.result?.[0] ?? { results: [] };
  return { rows: result.results ?? [], columns: result.results?.length ? Object.keys(result.results[0]) : [] };
}

const r1 = await d1Execute({ sql: 'SELECT id, status, title FROM videos WHERE id = ?', args: ['mpzkdnfknps'] });
console.log('mpzkdnfknps:', r1.rows.length ? r1.rows[0] : 'NOT FOUND');

const r2 = await d1Execute('SELECT id, title FROM videos LIMIT 5');
console.log('Sample IDs:', r2.rows.map(r => r.id));

const r3 = await d1Execute({ sql: 'SELECT video_id FROM trigger_usecase_pairs WHERE trigger_slug = ? AND intent_slug = ? LIMIT 5', args: ['rain', 'sleep'] });
console.log('Rain+sleep video_ids:', r3.rows.map(r => r.video_id));
