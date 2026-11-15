// tests/prune-audit.test.ts
import { describe, it, expect } from 'vitest';
import { auditPages, isIndexable, robotsFor, SITEMAP_VIDEO_FLOOR, type PageRow } from '../src/lib/prune-audit';

const page = (slug: string, video_count: number, sitemap_eligible: boolean | number, page_type = 'intent_trigger'): PageRow =>
  ({ slug, page_type, video_count, sitemap_eligible });

describe('isIndexable / robotsFor', () => {
  it('treats SQLite 1 and true as indexable', () => {
    expect(isIndexable({ sitemap_eligible: 1 })).toBe(true);
    expect(isIndexable({ sitemap_eligible: true })).toBe(true);
  });

  it('treats 0 and false as not indexable', () => {
    expect(isIndexable({ sitemap_eligible: 0 })).toBe(false);
    expect(isIndexable({ sitemap_eligible: false })).toBe(false);
  });

  it('emits noindex,follow for thin pages and undefined (default index) for eligible ones', () => {
    expect(robotsFor({ sitemap_eligible: 0 })).toBe('noindex,follow');
    expect(robotsFor({ sitemap_eligible: 1 })).toBeUndefined();
  });
});

describe('auditPages', () => {
  it('classifies indexable, thin, and dead pages', () => {
    const rows: PageRow[] = [
      page('sleep/rain', 40, 1),      // indexable
      page('sleep/tapping', 22, 1),   // indexable
      page('study/typing', 8, 0),     // thin (renderable, not eligible)
      page('relax/slime', 2, 0),      // thin
      page('adhd/sand', 0, 0),        // dead
    ];
    const r = auditPages(rows);
    expect(r.total).toBe(5);
    expect(r.indexable).toBe(2);
    expect(r.renderableThin).toBe(2);
    expect(r.dead).toBe(1);
    // thinRatio is over renderable (4), not total (5)
    expect(r.thinRatio).toBeCloseTo(0.5, 5);
  });

  it('ignores non-matrix page types', () => {
    const rows: PageRow[] = [
      page('sleep/rain', 40, 1),
      page('roleplay/barber', 3, 0, 'roleplay_hub'),
      page('/', 0, 0, 'utility'),
    ];
    const r = auditPages(rows);
    expect(r.total).toBe(1);
    expect(r.renderableThin).toBe(0);
  });

  it('sorts the thin sample thinnest-first and reports the hidden remainder', () => {
    const rows: PageRow[] = Array.from({ length: 5 }, (_, i) => page(`i/t${i}`, i + 1, 0));
    const r = auditPages(rows, 2);
    expect(r.thinPages).toHaveLength(2);
    expect(r.thinPages[0].videoCount).toBe(1);
    expect(r.thinPages[1].videoCount).toBe(2);
    expect(r.renderableThin).toBe(5);
    expect(r.verdict).toContain('3 beyond the listed sample');
  });

  it('reports a clean verdict when every renderable page is eligible', () => {
    const rows: PageRow[] = [page('sleep/rain', 40, 1), page('adhd/sand', 0, 0)];
    const r = auditPages(rows);
    expect(r.thinRatio).toBe(0);
    expect(r.verdict).toMatch(/^Clean:/);
  });

  it('buckets renderable pages and never buckets dead ones', () => {
    const rows: PageRow[] = [
      page('a/b', 3, 0),                       // 1-4
      page('c/d', 9, 0),                       // 5-14
      page('e/f', SITEMAP_VIDEO_FLOOR, 1),     // 15-49
      page('g/h', 80, 1),                      // 50+
      page('i/j', 0, 0),                       // dead -> not bucketed
    ];
    const r = auditPages(rows);
    const total = r.distribution.reduce((n, d) => n + d.count, 0);
    expect(total).toBe(4);
    expect(r.distribution.find(d => d.bucket === '1-4')?.count).toBe(1);
  });
});
