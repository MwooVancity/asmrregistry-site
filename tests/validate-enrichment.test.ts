// tests/validate-enrichment.test.ts
import { describe, it, expect } from 'vitest';
import { validateEnrichment } from '../cron-worker/src/validators/enrichment';

describe('validateEnrichment', () => {
  const validOutput = {
    primary_trigger: 'rain', triggers: ['rain', 'nature'], intents: ['sleep'],
    intensity: 3, format: 'ambient', roleplay_scenario: null,
    modifiers: ['no-talking'], duration_bucket: '1-hour',
    language: 'en', confidence: 0.9, is_asmr: true,
  };

  it('accepts valid output', () => {
    const result = validateEnrichment(validOutput);
    expect(result.valid).toBe(true);
  });

  it('rejects empty intents', () => {
    const result = validateEnrichment({ ...validOutput, intents: [] });
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe('no_intents');
  });

  it('rejects intensity out of range', () => {
    const result = validateEnrichment({ ...validOutput, intensity: 7 });
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe('invalid_intensity');
  });

  it('rejects non-integer intensity', () => {
    const result = validateEnrichment({ ...validOutput, intensity: 3.5 });
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe('invalid_intensity');
  });

  it('snaps invalid duration bucket to 1-hour (lenient)', () => {
    // Validator intentionally snaps bad buckets to '1-hour' rather than rejecting —
    // duration is derived deterministically from video length in enrich-batch anyway
    const result = validateEnrichment({ ...validOutput, duration_bucket: '12-hours' });
    expect(result.valid).toBe(true);
    expect(result.normalized.duration_bucket).toBe('1-hour');
  });

  it('normalizes language aliases', () => {
    const result = validateEnrichment({ ...validOutput, language: 'english' });
    expect(result.valid).toBe(true);
    expect(result.normalized.language).toBe('en');
  });

  it('normalizes language with underscore', () => {
    const result = validateEnrichment({ ...validOutput, language: 'en_US' });
    expect(result.valid).toBe(true);
    expect(result.normalized.language).toBe('en-US');
  });

  it('requires roleplay_scenario when format is roleplay', () => {
    const result = validateEnrichment({ ...validOutput, format: 'roleplay', roleplay_scenario: null });
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe('invalid_roleplay_scenario');
  });

  it('accepts valid roleplay scenario', () => {
    const result = validateEnrichment({ ...validOutput, format: 'roleplay', roleplay_scenario: 'barber-roleplay' });
    expect(result.valid).toBe(true);
    expect(result.normalized.roleplay_scenario).toBe('barber-roleplay');
  });

  it('nulls roleplay_scenario when format is not roleplay', () => {
    const result = validateEnrichment({ ...validOutput, format: 'ambient', roleplay_scenario: 'barber-roleplay' });
    expect(result.valid).toBe(true);
    expect(result.normalized.roleplay_scenario).toBe(null);
  });

  it('filters invalid intents but keeps valid ones (lenient)', () => {
    // Validator filters out invalid intents rather than dropping the whole row —
    // model occasionally emits a stray invalid intent alongside valid ones
    const result = validateEnrichment({ ...validOutput, intents: ['sleep', 'gaming'] });
    expect(result.valid).toBe(true);
    expect(result.normalized.intents).toEqual(['sleep']);
  });

  it('rejects when ALL intents are invalid', () => {
    const result = validateEnrichment({ ...validOutput, intents: ['gaming', 'sports'] });
    expect(result.valid).toBe(false);
    expect(result.failureReason).toBe('no_intents');
  });
});
