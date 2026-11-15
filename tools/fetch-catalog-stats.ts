// First-party catalog stats: per-trigger video count and length for an intent (sleep, study).
// One aggregate query per intent via idx_tup_trigger_intent_video; run weekly, never per request.
// Exits 1 and writes nothing if the data is empty or implausible.
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../scripts/lib/db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/lib/datasets.json');
const db = getDb();
const today = new Date().toISOString().split('T')[0];
const label = (s: string) => s.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const fmt = (sec: number) => (sec < 3600 ? `${Math.round(sec / 60)} min` : `${(sec / 3600).toFixed(1).replace(/\.0$/, '')} h`);
const pct = (a: number[], p: number) => a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];

async function catalog(intent: string, title: string, useWord: string) {
  const r = await db.execute({
    sql: `SELECT p.trigger_slug AS t, v.id AS id, v.duration_seconds AS d
          FROM trigger_usecase_pairs p JOIN videos v ON v.id = p.video_id
          WHERE p.intent_slug = ? AND v.status = 'published' AND v.duration_seconds > 0`,
    args: [intent],
  });
  const by = new Map<string, Map<string, number>>();
  for (const row of r.rows as any[]) {
    if (!by.has(row.t)) by.set(row.t, new Map());
    by.get(row.t)!.set(row.id, Number(row.d)); // dedupe video ids within a trigger
  }
  const stats = [...by.entries()].map(([t, m]) => {
    const d = [...m.values()].sort((a, b) => a - b);
    return { t, n: d.length, med: pct(d, 50), p25: pct(d, 25), p75: pct(d, 75), long: d.filter(x => x >= 3600).length / d.length };
  }).filter(s => s.n >= 30).sort((a, b) => b.n - a.n).slice(0, 12);
  const total = stats.reduce((n, s) => n + s.n, 0);
  if (stats.length < 5 || total < 1000) { console.error(`FAIL: ${intent} catalog implausible (${stats.length} triggers, ${total} videos)`); process.exit(1); }
  return {
    kind: 'table',
    title,
    columns: ['Trigger', 'Videos', 'Median length', 'Middle half of videos', 'Over 1 hour'],
    rows: stats.map(s => [label(s.t), s.n.toLocaleString('en-US'), fmt(s.med), `${fmt(s.p25)} to ${fmt(s.p75)}`, `${Math.round(s.long * 100)}%`]),
    source: 'ASMR Registry video database',
    sourceUrl: 'https://asmrregistry.com/methodology/',
    fetchedAt: today,
    unit: 'videos',
    note: `Counts and lengths describe published videos in our catalog that are classified for ${useWord} and tagged with each trigger. A video can carry more than one trigger, so it can appear in more than one row. These figures do not measure whether any sound helps you ${useWord}.`,
  };
}

const out: Record<string, any> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
out['catalog-sleep'] = await catalog('sleep', 'Sleep ASMR in our catalog: video length by trigger', 'sleep');
out['catalog-study'] = await catalog('study', 'Study ASMR in our catalog: video length by trigger', 'study');
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
for (const k of ['catalog-sleep', 'catalog-study']) console.log(k, out[k].rows.length, 'triggers | first:', out[k].rows[0].join(' | '));
