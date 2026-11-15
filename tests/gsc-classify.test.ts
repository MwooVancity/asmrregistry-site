// tests/gsc-classify.test.ts
import { describe, it, expect } from 'vitest';
import { classifyPage } from '../tools/gsc-classify.mjs';

describe('classifyPage', () => {
  it('WIN: position ≤ 10 with clicks', () => {
    expect(classifyPage({ clicks: 5, impressions: 200, position: 7.2 })).toBe('WIN');
  });
  it('CLOSE: position 11-30 with impressions ≥ 50', () => {
    expect(classifyPage({ clicks: 0, impressions: 80, position: 14.5 })).toBe('CLOSE');
  });
  it('DEAD: position > 30 with impressions ≥ 50', () => {
    expect(classifyPage({ clicks: 0, impressions: 120, position: 45 })).toBe('DEAD');
  });
  it('NEW: too few impressions to judge', () => {
    expect(classifyPage({ clicks: 0, impressions: 10, position: 60 })).toBe('NEW');
  });
});
