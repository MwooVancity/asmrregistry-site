// tests/trigger-stats.test.ts
import { describe, it, expect } from 'vitest';
import { computeCoOccurrence, topN } from '../cron-worker/src/stages/trigger-stats';

describe('computeCoOccurrence', () => {
  const rows = [
    { triggers: ['tapping', 'whispering'] },
    { triggers: ['tapping', 'whispering'] },
    { triggers: ['tapping', 'scratching'] },
    { triggers: ['tapping'] },
    { triggers: ['rain'] },
  ];

  it('computes pct of videos sharing each co-trigger', () => {
    const co = computeCoOccurrence(rows);
    // 4 tapping videos; 2 also whisper = 50%, 1 also scratches = 25%
    expect(co['tapping']).toEqual([
      { trigger: 'whispering', pct: 50 },
      { trigger: 'scratching', pct: 25 },
    ]);
  });

  it('caps at top 5 co-triggers', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      triggers: ['tapping', `t${i}`],
    }));
    const co = computeCoOccurrence(many);
    expect(co['tapping'].length).toBe(5);
  });

  it('solo triggers get an empty list', () => {
    const co = computeCoOccurrence(rows);
    expect(co['rain']).toEqual([]);
  });
});

describe('topN', () => {
  it('returns top N by count descending', () => {
    const out = topN([{ k: 'a', n: 1 }, { k: 'b', n: 9 }, { k: 'c', n: 5 }], 2, x => x.n);
    expect(out.map(x => x.k)).toEqual(['b', 'c']);
  });
});
