// cron-worker/src/validators/enrichment.ts
import { VALID_TRIGGERS, VALID_INTENTS, VALID_DURATIONS, VALID_ROLEPLAY_SCENARIOS, LANGUAGE_ALIASES } from '../constants';

interface GeminiOutput {
  primary_trigger?: string;
  triggers?: string[];
  intents: string[];
  intensity: number;
  format: string;
  roleplay_scenario: string | null;
  modifiers: string[];
  duration_bucket: string;
  language: string;
  confidence: number;
  is_asmr: boolean;
  why_watch?: string;
}

interface ValidationResult {
  valid: boolean;
  failureReason?: string;
  normalized: GeminiOutput;
}

export function validateEnrichment(output: GeminiOutput): ValidationResult {
  const normalized = { ...output };

  // Triggers are now assigned by keyword matching post-validation
  normalized.primary_trigger = normalized.primary_trigger ?? '';
  normalized.triggers = normalized.triggers ?? [];

  // Normalize language
  const rawLang = normalized.language ?? 'en';
  const lowerLang = rawLang.toLowerCase();
  normalized.language = LANGUAGE_ALIASES[lowerLang] ?? rawLang.replace(/_/g, '-');

  // Filter out-of-enum intents rather than dropping the whole row — the model
  // occasionally emits a stray invalid intent alongside valid ones. Fail only if
  // NONE survive. (Was: invalid_intent dropped ~8 good videos/day.)
  if (Array.isArray(normalized.intents)) {
    normalized.intents = normalized.intents.filter((i) => VALID_INTENTS.has(i));
  }
  if (!Array.isArray(normalized.intents) || normalized.intents.length === 0) {
    return { valid: false, failureReason: 'no_intents', normalized };
  }
  if (typeof normalized.intensity !== 'number' || normalized.intensity < 1 || normalized.intensity > 5 || !Number.isInteger(normalized.intensity)) {
    return { valid: false, failureReason: 'invalid_intensity', normalized };
  }
  // duration_bucket is derived deterministically from the real video length in
  // enrich-batch (bucketFromSeconds). Only validate the model's value as a
  // fallback for the rare case where duration is unknown; snap invalid → 1-hour.
  if (!VALID_DURATIONS.has(normalized.duration_bucket)) {
    normalized.duration_bucket = '1-hour';
  }
  if (normalized.format === 'roleplay') {
    if (!normalized.roleplay_scenario || !VALID_ROLEPLAY_SCENARIOS.has(normalized.roleplay_scenario)) {
      return { valid: false, failureReason: 'invalid_roleplay_scenario', normalized };
    }
  } else {
    normalized.roleplay_scenario = null;
  }

  return { valid: true, normalized };
}
