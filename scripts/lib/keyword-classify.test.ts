import { describe, it, expect } from 'vitest';
import { classifyByKeyword } from './keyword-classify.js';
import { validateEnrichment } from './enrichment.js';

const v = (title: string, opts: Partial<{ channel: string; dur: number; desc: string }> = {}) =>
  classifyByKeyword({
    raw_title: title,
    raw_channel_name: opts.channel ?? 'Some Channel',
    raw_duration_seconds: opts.dur ?? 1800,
    raw_description: opts.desc ?? '',
  });

// Mirrors the publish gate in tools/backfill-enrich.ts.
const publishes = (o: ReturnType<typeof classifyByKeyword>) =>
  o.confidence >= 0.7 && o.is_asmr && !!o.primary_trigger && o.triggers!.length > 0 && o.intents.length > 0;

describe('is_asmr gate', () => {
  it('rejects non-ASMR junk from discovery-polluted channels', () => {
    for (const t of [
      'INSANE 1v5 CLUTCH! Ranked Gameplay',
      'I Ate At The Best Korean BBQ In Seoul',
      'How To Build Wealth - Motivational Speech',
    ]) {
      const o = v(t, { channel: 'JKrew Gaming' });
      expect(o.is_asmr, t).toBe(false);
      expect(o.confidence, t).toBeLessThanOrEqual(0.3);
      expect(publishes(o), t).toBe(false);
    }
  });

  it('publishes a clear ASMR video', () => {
    const o = v('ASMR Tapping and Whispering for Sleep', { channel: 'Gibi ASMR', dur: 2400 });
    expect(o.is_asmr).toBe(true);
    expect(o.confidence).toBeGreaterThanOrEqual(0.7);
    expect(o.triggers).toContain('tapping');
    expect(o.intents).toContain('sleep');
    expect(publishes(o)).toBe(true);
  });

  it('accepts long-form ambient sleep audio that never says "ASMR"', () => {
    const o = v('Heavy Rain and Thunder Sounds for Sleeping - 10 Hours', { channel: 'Sleep Sounds', dur: 36000 });
    expect(o.is_asmr).toBe(true);
    expect(publishes(o)).toBe(true);
  });

  it('does not accept a short ambient clip with no ASMR signal', () => {
    const o = v('Rain on my window', { dur: 400 });
    expect(o.is_asmr).toBe(false);
  });
});

describe('format and scenario', () => {
  it('maps a roleplay to a specific scenario', () => {
    const o = v('ASMR Dentist Roleplay - Teeth Cleaning', { dur: 1500 });
    expect(o.format).toBe('roleplay');
    expect(o.roleplay_scenario).toBe('dentist-roleplay');
  });

  it('stays ambient when "roleplay" has no placeable scenario', () => {
    const o = v('ASMR Roleplay for Tingles', { dur: 900 });
    expect(o.format).toBe('ambient');
    expect(o.roleplay_scenario).toBeNull();
  });
});

describe('language', () => {
  it('detects CJK scripts, checking kana before han', () => {
    expect(v('ASMR 囁き 耳かき', { dur: 900 }).language).toBe('ja');
    expect(v('ASMR 속삭임 이어클리닝', { dur: 900 }).language).toBe('ko');
    expect(v('ASMR 助眠 耳部按摩', { dur: 900 }).language).toBe('zh');
    expect(v('ASMR Tapping for Sleep', { dur: 900 }).language).toBe('en');
  });
});

describe('validator round-trip', () => {
  // The classifier must never emit something validateEnrichment rejects — a rejection
  // here would mark the queue row 'failed' and silently drop the video.
  it('produces output the validator always accepts when is_asmr', () => {
    const cases = [
      v('ASMR Tapping for Sleep', { dur: 3600 }),
      v('ASMR Eating Sounds Mukbang', { dur: 600 }),
      v('ASMR Medical Roleplay Cranial Nerve Exam', { dur: 2000 }),
      v('Crackling Fireplace and Rain for Deep Sleep', { dur: 28800 }),
      v('ASMR', { dur: 0 }),
    ];
    for (const c of cases) {
      const { valid, failureReason } = validateEnrichment(c);
      expect(valid, `${failureReason} for intents=${JSON.stringify(c.intents)}`).toBe(true);
    }
  });

  it('emits an integer intensity in 1..5 and never a why_watch', () => {
    const o = v('ASMR Mouth Sounds and Kisses', { dur: 900 });
    expect(Number.isInteger(o.intensity)).toBe(true);
    expect(o.intensity).toBeGreaterThanOrEqual(1);
    expect(o.intensity).toBeLessThanOrEqual(5);
    expect(o.why_watch).toBeUndefined();
  });
});
