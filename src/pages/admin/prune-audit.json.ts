// src/pages/admin/prune-audit.json.ts
// Standing thin-content / index-bloat detector. Algorithmic demotions never
// surface in Search Console, so this endpoint reports the index-bloat surface
// (pages that render + are internally linked but are too thin to be sitemap-
// eligible) before Google's site-wide quality classifier acts on it.
//
// Auth: requires ?token=<ADMIN_TOKEN>. If ADMIN_TOKEN is unset the endpoint is
// disabled (503) rather than open. Read-only — never mutates the DB.
import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';
import { auditPages, type PageRow } from '../../lib/prune-audit';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body, null, 2), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });

  const expected = import.meta.env.ADMIN_TOKEN;
  if (!expected) return json({ ok: false, error: 'audit_disabled', detail: 'ADMIN_TOKEN not set' }, 503);
  if (url.searchParams.get('token') !== expected) return json({ ok: false, error: 'unauthorized' }, 401);

  try {
    const db = getDb();
    const res = await db.execute(
      `SELECT slug, page_type, video_count, sitemap_eligible FROM active_pages WHERE page_type = 'intent_trigger'`
    );
    const rows = res.rows as unknown as PageRow[];
    const report = auditPages(rows);

    // Axis-sparsity: which intents / triggers generate the most thin pages —
    // a sparse axis is a consolidation candidate (fold leaves back into the hub).
    const thinByIntent: Record<string, number> = {};
    const thinByTrigger: Record<string, number> = {};
    for (const tp of report.thinPages) {
      const [intent, trigger] = tp.slug.split('/');
      if (intent) thinByIntent[intent] = (thinByIntent[intent] ?? 0) + 1;
      if (trigger) thinByTrigger[trigger] = (thinByTrigger[trigger] ?? 0) + 1;
    }
    const topAxis = (m: Record<string, number>) =>
      Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ key: k, thin: v }));

    return json({
      ok: report.thinRatio < 0.5,
      ...report,
      consolidationCandidates: {
        byIntent: topAxis(thinByIntent),
        byTrigger: topAxis(thinByTrigger),
      },
    });
  } catch (err) {
    return json({ ok: false, error: 'db_unavailable', detail: (err as Error).message }, 200);
  }
};
