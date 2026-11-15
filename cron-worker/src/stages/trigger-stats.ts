// cron-worker/src/stages/trigger-stats.ts — the aggregate index (data moat).
// Pure compute up top; runTriggerStats is the cron stage (hour 5).
import type { Client } from '../d1-adapter';

export function computeCoOccurrence(
  rows: { triggers: string[] }[],
): Record<string, { trigger: string; pct: number }[]> {
  const totals = new Map<string, number>();
  const pairs = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const uniq = [...new Set(row.triggers)];
    for (const t of uniq) {
      totals.set(t, (totals.get(t) ?? 0) + 1);
      let m = pairs.get(t);
      if (!m) { m = new Map(); pairs.set(t, m); }
      for (const u of uniq) {
        if (u !== t) m.set(u, (m.get(u) ?? 0) + 1);
      }
    }
  }

  const out: Record<string, { trigger: string; pct: number }[]> = {};
  for (const [t, total] of totals) {
    const co = [...(pairs.get(t) ?? new Map<string, number>())]
      .map(([trigger, n]) => ({ trigger, pct: Math.round((n / total) * 100) }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
    out[t] = co;
  }
  return out;
}

export function topN<T>(items: T[], n: number, by: (x: T) => number): T[] {
  return [...items].sort((a, b) => by(b) - by(a)).slice(0, n);
}

// 5 SELECTs + 1 batch UPSERT — far under the 50-subrequest free-tier cap.
export async function runTriggerStats(db: Client): Promise<{ triggers: number }> {
  // 1. All published triggers JSON for co-occurrence
  const triggerRows = await db.execute(
    `SELECT triggers FROM videos WHERE status = 'published' AND triggers IS NOT NULL AND triggers != '[]'`
  );
  const parsed = triggerRows.rows.map(r => ({
    triggers: JSON.parse((r.triggers as string) || '[]') as string[],
  }));
  const coOcc = computeCoOccurrence(parsed);

  // 2. Per-trigger counts + avg intensity (by primary trigger)
  const agg = await db.execute(
    `SELECT primary_trigger AS t, COUNT(*) AS cnt, AVG(intensity) AS avg_int
     FROM videos WHERE status = 'published' AND primary_trigger != '' GROUP BY primary_trigger`
  );

  // 3. New this week — created_at is the honest directory-entry date
  const fresh = await db.execute(
    `SELECT primary_trigger AS t, COUNT(*) AS cnt FROM videos
     WHERE status = 'published' AND primary_trigger != ''
       AND created_at >= datetime('now', '-7 days')
     GROUP BY primary_trigger`
  );
  const freshMap = new Map(fresh.rows.map(r => [r.t as string, Number(r.cnt)]));

  // 4. Top creators per trigger
  const creators = await db.execute(
    `SELECT primary_trigger AS t, channel_id, channel_name, COUNT(*) AS cnt
     FROM videos WHERE status = 'published' AND primary_trigger != ''
     GROUP BY primary_trigger, channel_id`
  );
  const creatorMap = new Map<string, { channel_id: string; name: string; count: number }[]>();
  for (const r of creators.rows) {
    const t = r.t as string;
    if (!creatorMap.has(t)) creatorMap.set(t, []);
    creatorMap.get(t)!.push({ channel_id: r.channel_id as string, name: (r.channel_name as string) ?? '', count: Number(r.cnt) });
  }

  // 5. Intent counts per trigger
  const intents = await db.execute(
    `SELECT p.trigger_slug AS t, p.intent_slug AS i, COUNT(DISTINCT p.video_id) AS cnt
     FROM trigger_usecase_pairs p JOIN videos v ON v.id = p.video_id AND v.status = 'published'
     GROUP BY p.trigger_slug, p.intent_slug`
  );
  const intentMap = new Map<string, Record<string, number>>();
  for (const r of intents.rows) {
    const t = r.t as string;
    if (!intentMap.has(t)) intentMap.set(t, {});
    intentMap.get(t)![r.i as string] = Number(r.cnt);
  }

  const statements = agg.rows.map(r => {
    const t = r.t as string;
    return {
      sql: `INSERT INTO trigger_stats (trigger_slug, video_count, new_this_week, co_occurrence, top_creators, avg_intensity, intent_counts, computed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(trigger_slug) DO UPDATE SET
              video_count = excluded.video_count,
              new_this_week = excluded.new_this_week,
              co_occurrence = excluded.co_occurrence,
              top_creators = excluded.top_creators,
              avg_intensity = excluded.avg_intensity,
              intent_counts = excluded.intent_counts,
              computed_at = excluded.computed_at`,
      args: [
        t,
        Number(r.cnt),
        freshMap.get(t) ?? 0,
        JSON.stringify(coOcc[t] ?? []),
        JSON.stringify(topN(creatorMap.get(t) ?? [], 5, c => c.count)),
        r.avg_int === null ? null : Number(r.avg_int),
        JSON.stringify(intentMap.get(t) ?? {}),
      ],
    };
  });
  if (statements.length > 0) await db.batch(statements, 'write');
  return { triggers: statements.length };
}
