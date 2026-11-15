// src/lib/prune-audit.ts
// Pure classification logic for the thin-content / index-bloat audit.
//
// The matrix has three thresholds that must stay reconciled:
//   - render/redirect: a combo renders when video_count >= 1 (else 301 to parent)
//   - internal links:  peer nav links combos with video_count >= 1
//   - sitemap:         eligible only when video_count >= SITEMAP_VIDEO_FLOOR (set by cron)
//
// The gap {renders for users} minus {sitemap_eligible} is the index-bloat
// surface: pages crawlable via internal links but too thin to index. Every page
// in that gap must emit noindex,follow (see isIndexable). This module reports the
// surface so it can be watched before Google's site-wide classifier acts on it.

/** Video floor at which a matrix page becomes sitemap-eligible / indexable. Mirrors the cron's threshold. */
export const SITEMAP_VIDEO_FLOOR = 15;

export interface PageRow {
  slug: string;
  page_type: string;
  video_count: number;
  /** libsql returns SQLite BOOLEAN as 0 | 1 */
  sitemap_eligible: boolean | number;
}

export interface ThinPage {
  slug: string;
  videoCount: number;
}

export interface PruneAuditReport {
  total: number;
  /** sitemap_eligible — in the index by design */
  indexable: number;
  /** video_count >= 1 but NOT sitemap_eligible — the index-bloat surface */
  renderableThin: number;
  /** video_count === 0 — middleware 301s these to the parent hub */
  dead: number;
  /** Share of renderable pages that are thin, 0..1. The headline risk metric. */
  thinRatio: number;
  /** Sample of the thinnest pages (lowest video_count first), capped. */
  thinPages: ThinPage[];
  /** Distribution of renderable pages across video-count buckets. */
  distribution: { bucket: string; count: number }[];
  /** Plain-language verdict for the operator. */
  verdict: string;
}

const TRUTHY = (v: boolean | number): boolean => v === true || v === 1;

/** True when a rendered matrix page should be allowed into Google's index. */
export function isIndexable(row: Pick<PageRow, 'sitemap_eligible'>): boolean {
  return TRUTHY(row.sitemap_eligible);
}

/** The robots meta value a matrix page should emit. Thin pages stay crawlable (follow) but leave the index. */
export function robotsFor(row: Pick<PageRow, 'sitemap_eligible'>): string | undefined {
  return isIndexable(row) ? undefined : 'noindex,follow';
}

function bucketFor(vc: number): string {
  if (vc === 0) return '0';
  if (vc < 5) return '1-4';
  if (vc < SITEMAP_VIDEO_FLOOR) return `5-${SITEMAP_VIDEO_FLOOR - 1}`;
  if (vc < 50) return `${SITEMAP_VIDEO_FLOOR}-49`;
  return '50+';
}

/**
 * Classify the matrix into indexable / thin / dead and quantify the index-bloat
 * surface. Pure: takes rows, returns a report. `sampleLimit` caps the thinnest
 * pages listed (the rest are counted, never silently dropped — see verdict).
 */
export function auditPages(rows: PageRow[], sampleLimit = 50): PruneAuditReport {
  const matrix = rows.filter(r => r.page_type === 'intent_trigger');
  const total = matrix.length;

  let indexable = 0;
  let dead = 0;
  const thin: ThinPage[] = [];
  const dist = new Map<string, number>();

  for (const r of matrix) {
    const vc = Number(r.video_count ?? 0);
    if (vc === 0) { dead++; continue; }
    dist.set(bucketFor(vc), (dist.get(bucketFor(vc)) ?? 0) + 1);
    if (isIndexable(r)) indexable++;
    else thin.push({ slug: r.slug, videoCount: vc });
  }

  const renderable = total - dead;
  const renderableThin = thin.length;
  const thinRatio = renderable > 0 ? renderableThin / renderable : 0;

  thin.sort((a, b) => a.videoCount - b.videoCount);
  const thinPages = thin.slice(0, sampleLimit);

  const order = ['1-4', `5-${SITEMAP_VIDEO_FLOOR - 1}`, `${SITEMAP_VIDEO_FLOOR}-49`, '50+'];
  const distribution = order
    .filter(b => dist.has(b))
    .map(bucket => ({ bucket, count: dist.get(bucket)! }));

  const pct = Math.round(thinRatio * 100);
  const hidden = renderableThin - thinPages.length;
  const verdict =
    renderable === 0
      ? 'No renderable matrix pages found.'
      : thinRatio === 0
      ? `Clean: all ${renderable} renderable pages are sitemap-eligible and indexable.`
      : `${renderableThin}/${renderable} renderable pages (${pct}%) are thin (<${SITEMAP_VIDEO_FLOOR} videos) and must carry noindex,follow. ` +
        `Confirm the matrix template emits noindex for these${hidden > 0 ? ` (${hidden} beyond the listed sample)` : ''}.`;

  return { total, indexable, renderableThin, dead, thinRatio, thinPages, distribution, verdict };
}
