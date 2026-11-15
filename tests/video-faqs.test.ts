// tests/video-faqs.test.ts
import { describe, it, expect } from 'vitest';
import { deriveVideoFaqs } from '../src/lib/video-faqs';

const base = {
  triggerLabel: 'tapping',
  intentLabels: ['sleep', 'tingles'],
  durationMin: 95,
  intensity: 3,
  coOccurrence: [
    { trigger: 'whispering', pct: 62 },
    { trigger: 'scratching', pct: 31 },
  ],
  triggerVideoCount: 480,
};

describe('deriveVideoFaqs', () => {
  it('returns at least 3 Q&As', () => {
    expect(deriveVideoFaqs(base).length).toBeGreaterThanOrEqual(3);
  });

  it('intent-fit answer names the intent and the intensity number', () => {
    const faqs = deriveVideoFaqs(base);
    const fit = faqs.find(f => f.q.includes('good for sleep'));
    expect(fit).toBeDefined();
    expect(fit!.a).toContain('3/5');
  });

  it("duration answer carries this video's real length", () => {
    const faqs = deriveVideoFaqs(base);
    const dur = faqs.find(f => f.q.toLowerCase().includes('how long'));
    expect(dur!.a).toContain('1 hour 35 minutes');
  });

  it('pairing answer carries real co-occurrence percentages', () => {
    const faqs = deriveVideoFaqs(base);
    const pair = faqs.find(f => f.q.includes('pair'));
    expect(pair!.a).toContain('62%');
    expect(pair!.a).toContain('whispering');
  });

  it('falls back gracefully without co-occurrence data', () => {
    const faqs = deriveVideoFaqs({ ...base, coOccurrence: [], triggerVideoCount: 0 });
    expect(faqs.length).toBeGreaterThanOrEqual(2);
    expect(faqs.every(f => f.q.length > 0 && f.a.length > 0)).toBe(true);
  });

  it('duration 0 (unknown length) still clears the ≥3 render gate', () => {
    const faqs = deriveVideoFaqs({ ...base, durationMin: 0 });
    expect(faqs.find(f => f.q.toLowerCase().includes('how long'))).toBeUndefined();
    expect(faqs.length).toBeGreaterThanOrEqual(3);
  });

  it('no intents → no intent-fit question, still ≥2 faqs', () => {
    const faqs = deriveVideoFaqs({ ...base, intentLabels: [] });
    expect(faqs.find(f => f.q.includes('good for'))).toBeUndefined();
    expect(faqs.length).toBeGreaterThanOrEqual(2);
  });
});
