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
const q = async (label, sql) => {
  try { const r = await d1Execute(sql); console.log(`\n=== ${label} ===`); console.table(r.rows); }
  catch (e) { console.log(`\n=== ${label} ===\nERROR: ${e}`); }
};

await q('failure_reason breakdown (today)', `
  SELECT failure_reason, COUNT(*) c FROM ingest_queue
  WHERE processing_status='failed' AND processed_at >= datetime('now','start of day')
  GROUP BY failure_reason ORDER BY c DESC`);

await q('failure_reason breakdown (last 3 days)', `
  SELECT date(processed_at) d, failure_reason, COUNT(*) c FROM ingest_queue
  WHERE processing_status='failed' AND processed_at >= datetime('now','-3 days')
  GROUP BY d, failure_reason ORDER BY d DESC, c DESC`);

await q('queue status counts', `
  SELECT processing_status, COUNT(*) c FROM ingest_queue GROUP BY processing_status ORDER BY c DESC`);

await q('queue INFLOW vs OUTFLOW (today)', `
  SELECT
    (SELECT COUNT(*) FROM ingest_queue WHERE queued_at >= datetime('now','start of day')) queued_today,
    (SELECT COUNT(*) FROM ingest_queue WHERE processed_at >= datetime('now','start of day')) processed_today`);

await q('queued_at by day (last 5 days) — is taxonomy refilling?', `
  SELECT date(queued_at) d, COUNT(*) c FROM ingest_queue
  WHERE queued_at >= datetime('now','-5 days') GROUP BY d ORDER BY d DESC`);

await q('cron_state key signals', `
  SELECT key, substr(value,1,60) value FROM cron_state
  WHERE key IN ('last_successful_run','taxonomy_search_index','publish_cap','current_phase','pipeline_start_date','baseline_confidence')`);

await q('published today / total', `
  SELECT
    (SELECT COUNT(*) FROM videos WHERE status='published') total_published,
    (SELECT COUNT(*) FROM videos WHERE status='published' AND last_synchronized >= datetime('now','start of day')) published_today,
    (SELECT COUNT(*) FROM videos WHERE status='draft') drafts,
    (SELECT COUNT(*) FROM videos WHERE status='rejected') rejected`);

await q('sample of today deepseek_error responses', `
  SELECT substr(gemini_response,1,200) resp, COUNT(*) c FROM ingest_queue
  WHERE failure_reason='deepseek_error' AND processed_at >= datetime('now','-2 days')
  GROUP BY substr(gemini_response,1,80) ORDER BY c DESC LIMIT 5`);

// Live DeepSeek key test
console.log('\n=== LIVE DeepSeek key test ===');
try {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 10, messages: [{ role: 'user', content: 'say ok' }] }),
  });
  console.log(`HTTP ${res.status} ${res.statusText}`);
  console.log((await res.text()).slice(0, 300));
} catch (e) { console.log(`FETCH ERROR: ${e}`); }

process.exit(0);
