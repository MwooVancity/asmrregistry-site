// cron-worker/src/stages/channel-agg.ts
import type { Client } from '../d1-adapter';

export async function runChannelAggregation(db: Client, affectedChannelIds: string[]): Promise<number> {
  let updated = 0;
  for (const channelId of affectedChannelIds) {
    // Single query: count, avg intensity, and top triggers in one pass
    const stats = await db.execute({
      sql: `SELECT
              COUNT(*) as video_count,
              AVG(intensity) as avg_intensity,
              primary_trigger,
              COUNT(*) as trig_cnt
            FROM videos
            WHERE channel_id = ? AND status = 'published'
            GROUP BY primary_trigger
            ORDER BY trig_cnt DESC
            LIMIT 5`,
      args: [channelId],
    });

    // video_count is the sum across all groups; top triggers are the rows themselves
    const videoCount = stats.rows.reduce((sum, r) => sum + (r.trig_cnt as number), 0);
    const intensityRows = stats.rows.filter(r => r.avg_intensity != null);
    const avgIntensity = intensityRows.length > 0
      ? intensityRows.reduce((sum, r) => sum + (r.avg_intensity as number) * (r.trig_cnt as number), 0) / intensityRows.reduce((sum, r) => sum + (r.trig_cnt as number), 0)
      : null;
    const topTriggers = stats.rows.map(r => r.primary_trigger);

    await db.execute({
      sql: `UPDATE channels SET video_count = ?, avg_intensity = ?, top_triggers = ?, last_updated = datetime('now') WHERE id = ?`,
      args: [videoCount, avgIntensity, JSON.stringify(topTriggers), channelId],
    });
    updated++;
  }
  return updated;
}
