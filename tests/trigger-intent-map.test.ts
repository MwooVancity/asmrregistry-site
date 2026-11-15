// tests/trigger-intent-map.test.ts
import { describe, it, expect } from 'vitest';
import { TRIGGER_INTENT_MAP, VALID_TRIGGERS, VALID_INTENTS, RELATED_TRIGGERS } from '../src/lib/constants';
import { TRIGGER_TIER_MAP } from '../cron-worker/src/constants';

describe('TRIGGER_INTENT_MAP', () => {
  it('covers all 36 triggers', () => {
    for (const trigger of VALID_TRIGGERS) {
      expect(TRIGGER_INTENT_MAP).toHaveProperty(trigger);
    }
  });

  it('all intents in the map are valid', () => {
    for (const [trigger, intents] of Object.entries(TRIGGER_INTENT_MAP)) {
      for (const intent of intents) {
        expect(VALID_INTENTS.has(intent)).toBe(true);
      }
    }
  });

  it('each trigger has at least 1 intent', () => {
    for (const [trigger, intents] of Object.entries(TRIGGER_INTENT_MAP)) {
      expect(intents.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('nonsensical combos are excluded', () => {
    // Tapping should not have tinnitus (tapping is percussive, bad for tinnitus)
    expect(TRIGGER_INTENT_MAP['tapping']).not.toContain('tinnitus');
    // Rain should not have tingles (rain is ambient, not a tingle trigger)
    expect(TRIGGER_INTENT_MAP['rain']).not.toContain('tingles');
  });
});

describe('TRIGGER_TIER_MAP', () => {
  it('covers all 36 triggers', () => {
    for (const trigger of VALID_TRIGGERS) {
      expect(TRIGGER_TIER_MAP).toHaveProperty(trigger);
    }
  });

  it('all tiers are valid (S, A, B, C)', () => {
    for (const tier of Object.values(TRIGGER_TIER_MAP)) {
      expect(['S', 'A', 'B', 'C']).toContain(tier);
    }
  });

  it('has exactly 3 S-tier triggers', () => {
    const sTier = Object.entries(TRIGGER_TIER_MAP).filter(([, t]) => t === 'S');
    expect(sTier.length).toBe(3);
  });
});

describe('RELATED_TRIGGERS', () => {
  it('covers all 36 triggers', () => {
    for (const trigger of VALID_TRIGGERS) {
      expect(RELATED_TRIGGERS).toHaveProperty(trigger);
    }
  });

  it('all related triggers reference valid triggers or known roleplay scenarios', () => {
    const validRefs = new Set([...VALID_TRIGGERS, 'spa', 'library', 'meditation', 'friend-roleplay']);
    for (const [trigger, related] of Object.entries(RELATED_TRIGGERS)) {
      for (const r of related) {
        expect(validRefs.has(r)).toBe(true);
      }
    }
  });
});
