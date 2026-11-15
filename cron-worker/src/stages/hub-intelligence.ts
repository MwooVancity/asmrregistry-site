// cron-worker/src/stages/hub-intelligence.ts
import type { Client } from '../d1-adapter';
import { SITEMAP_CAP, TRIGGER_TIER_MAP, TRIGGER_INTENT_MAP } from '../constants';
import { getCronState } from '../lib/helpers';

export async function runHubIntelligence(db: Client): Promise<{ hubsComputed: number; pagesCreated: number; pagesEligible: number }> {
  // Compute intent×trigger hub_intelligence
  await db.execute(`
    INSERT OR REPLACE INTO hub_intelligence (hub_slug, hub_type, video_count, avg_intensity, long_format_pct, no_talking_pct, binaural_pct, duration_distribution, top_creators, computed_at)
    SELECT
      p.intent_slug || '/' || p.trigger_slug AS hub_slug,
      'intent_trigger' AS hub_type,
      COUNT(DISTINCT p.video_id) AS video_count,
      AVG(v.intensity) AS avg_intensity,
      CAST(SUM(CASE WHEN v.duration_seconds >= 3600 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS long_format_pct,
      CAST(SUM(CASE WHEN v.modifiers LIKE '%no-talking%' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS no_talking_pct,
      CAST(SUM(CASE WHEN v.modifiers LIKE '%binaural%' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS binaural_pct,
      json_object(
        '5-minutes',  CAST(SUM(CASE WHEN v.duration_bucket='5-minutes'  THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '10-minutes', CAST(SUM(CASE WHEN v.duration_bucket='10-minutes' THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '15-minutes', CAST(SUM(CASE WHEN v.duration_bucket='15-minutes' THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '20-minutes', CAST(SUM(CASE WHEN v.duration_bucket='20-minutes' THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '30-minutes', CAST(SUM(CASE WHEN v.duration_bucket='30-minutes' THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '1-hour',     CAST(SUM(CASE WHEN v.duration_bucket='1-hour'     THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '2-hours',    CAST(SUM(CASE WHEN v.duration_bucket='2-hours'    THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '3-hours',    CAST(SUM(CASE WHEN v.duration_bucket='3-hours'    THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '4-hours',    CAST(SUM(CASE WHEN v.duration_bucket='4-hours'    THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '8-hours',    CAST(SUM(CASE WHEN v.duration_bucket='8-hours'    THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        '10-hours',   CAST(SUM(CASE WHEN v.duration_bucket='10-hours'   THEN 1 ELSE 0 END) AS REAL) / COUNT(*),
        'looped',     CAST(SUM(CASE WHEN v.duration_bucket='looped'     THEN 1 ELSE 0 END) AS REAL) / COUNT(*)
      ) AS duration_distribution,
      (SELECT json_group_array(channel_name) FROM (
        SELECT v2.channel_name, v2.channel_id, COUNT(*) AS cnt
        FROM trigger_usecase_pairs p2
        JOIN videos v2 ON v2.id = p2.video_id AND v2.status = 'published'
        WHERE p2.trigger_slug = p.trigger_slug AND p2.intent_slug = p.intent_slug
        GROUP BY v2.channel_id ORDER BY cnt DESC LIMIT 3
      )) AS top_creators,
      datetime('now') AS computed_at
    FROM trigger_usecase_pairs p
    JOIN videos v ON v.id = p.video_id AND v.status = 'published'
    GROUP BY p.trigger_slug, p.intent_slug
    HAVING COUNT(DISTINCT p.video_id) >= 5
  `);

  // v16: roleplay hub pages deleted — no roleplay hub_intelligence is computed.
  // roleplay_scenario stays a video classification field; the PAGES are gone.

  const hubsResult = await db.execute(`SELECT COUNT(*) as cnt FROM hub_intelligence`);
  const hubsComputed = hubsResult.rows[0].cnt as number;

  // Auto-create missing active_pages (v15: TRIGGER_INTENT_MAP filter)
  const newHubs = await db.execute(`
    SELECT hub_slug, hub_type FROM hub_intelligence
    WHERE hub_slug NOT IN (SELECT slug FROM active_pages)
  `);

  let pagesCreated = 0;
  const currentPhase = await getCronState(db, 'current_phase');
  for (const hub of newHubs.rows) {
    if (hub.hub_type === 'intent_trigger') {
      const parts = (hub.hub_slug as string).split('/');
      const intent = parts[0];
      const trigger = parts[1];
      const validIntents = TRIGGER_INTENT_MAP[trigger];
      if (!validIntents || !validIntents.includes(intent)) continue;
    }
    await db.execute({
      sql: `INSERT OR IGNORE INTO active_pages (slug, page_type, publish_phase, sitemap_eligible, last_updated) VALUES (?, ?, ?, FALSE, datetime('now'))`,
      args: [hub.hub_slug, hub.hub_type, parseInt(currentPhase || '1')],
    });
    const triggerSlug = (hub.hub_slug as string).split('/').pop()!;
    const tier = TRIGGER_TIER_MAP[triggerSlug] ?? 'C';
    await db.execute({
      sql: `UPDATE active_pages SET search_volume_tier = ? WHERE slug = ? AND search_volume_tier IS NULL`,
      args: [tier, hub.hub_slug],
    });
    pagesCreated++;
  }

  // Sync video_count for intent×trigger and roleplay pages from hub_intelligence
  await db.execute(`
    UPDATE active_pages SET
      video_count = (SELECT video_count FROM hub_intelligence WHERE hub_slug = active_pages.slug),
      last_updated = datetime('now')
    WHERE slug IN (SELECT hub_slug FROM hub_intelligence)
      AND video_count != (SELECT video_count FROM hub_intelligence WHERE hub_slug = active_pages.slug)
  `);

  // Sync video_count for intent hub pages (slug = intent_slug, no trigger component).
  // hub_intelligence only tracks intent×trigger pairs, so intent hubs need a separate count.
  await db.execute(`
    UPDATE active_pages SET
      video_count = (
        SELECT COUNT(DISTINCT p.video_id)
        FROM trigger_usecase_pairs p
        JOIN videos v ON v.id = p.video_id AND v.status = 'published'
        WHERE p.intent_slug = active_pages.slug
      ),
      last_updated = datetime('now')
    WHERE page_type = 'intent_hub'
  `);

  // Template editorial angles removed — they were synonym substitution across 140 pages.
  // The HubIntelligence component displays the same stats as clean data widgets.
  // editorial_angle column kept for future use with genuinely unique per-page content.

  // Set sitemap_eligible=TRUE (cap SITEMAP_CAP, S->A->B->C order)
  let pagesEligible = 0;
  const candidates = await db.execute({
    sql: `SELECT slug, search_volume_tier FROM active_pages
          WHERE sitemap_eligible = FALSE AND video_count >= 15
          ORDER BY CASE search_volume_tier WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 ELSE 4 END
          LIMIT ?`,
    args: [SITEMAP_CAP],
  });
  for (const page of candidates.rows) {
    await db.execute({
      sql: `UPDATE active_pages SET sitemap_eligible = TRUE, last_updated = datetime('now') WHERE slug = ?`,
      args: [page.slug],
    });
    pagesEligible++;
  }

  // Handle dead hubs (video_count = 0). Exclude intent_hub — those are editorially-written
  // pillar pages that stay eligible even before videos accumulate.
  await db.execute(`UPDATE active_pages SET sitemap_eligible = FALSE WHERE video_count = 0 AND sitemap_eligible = TRUE AND page_type != 'intent_hub'`);

  return { hubsComputed, pagesCreated, pagesEligible };
}
