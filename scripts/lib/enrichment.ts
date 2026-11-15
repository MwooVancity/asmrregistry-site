// scripts/lib/enrichment.ts — DeepSeek classification + validation for local backfill.
// Mirrors cron-worker/src/stages/enrich-batch.ts + validators/enrichment.ts.

const VALID_INTENTS = new Set([
  'sleep', 'study', 'relax', 'tingles', 'anxiety', 'insomnia',
  'meditation', 'background', 'adhd', 'headache', 'depression', 'kids', 'tinnitus',
]);

const VALID_DURATIONS = new Set([
  '5-minutes', '10-minutes', '15-minutes', '20-minutes', '30-minutes',
  '1-hour', '2-hours', '3-hours', '4-hours', '8-hours', '10-hours', 'looped',
]);

const VALID_ROLEPLAY_SCENARIOS = new Set([
  'medical-roleplay', 'dentist-roleplay', 'barber-roleplay', 'spa-roleplay',
  'library', 'coffee-shop', 'hotel-checkin', 'friend-roleplay',
  'teacher-roleplay', 'therapist-roleplay', 'makeup-artist', 'tattoo-artist',
  'eye-exam', 'camping', 'airplane', 'astrologer-roleplay',
  'fairy-roleplay', 'vampire-roleplay', 'elf-roleplay', 'alien-roleplay',
  'witch-roleplay', 'robot-roleplay', 'time-traveler-roleplay',
  'caring-presence', 'mentor-roleplay',
]);

const LANGUAGE_ALIASES: Record<string, string> = {
  'english': 'en', 'eng': 'en', 'spanish': 'es', 'french': 'fr', 'german': 'de',
  'japanese': 'ja', 'korean': 'ko', 'portuguese': 'pt', 'italian': 'it',
  'chinese': 'zh', 'dutch': 'nl',
};

// Trigger keywords + matchTriggers live in one place, shared with the live Worker.
export { matchTriggers } from '../../cron-worker/src/constants';

const DURATION_BUCKET_POINTS = [
  { bucket: '5-minutes', sec: 300 }, { bucket: '10-minutes', sec: 600 },
  { bucket: '15-minutes', sec: 900 }, { bucket: '20-minutes', sec: 1200 },
  { bucket: '30-minutes', sec: 1800 }, { bucket: '1-hour', sec: 3600 },
  { bucket: '2-hours', sec: 7200 }, { bucket: '3-hours', sec: 10800 },
  { bucket: '4-hours', sec: 14400 }, { bucket: '8-hours', sec: 28800 },
  { bucket: '10-hours', sec: 36000 },
];


export function bucketFromSeconds(sec: number): string {
  let best = DURATION_BUCKET_POINTS[0];
  for (const p of DURATION_BUCKET_POINTS) {
    if (Math.abs(p.sec - sec) < Math.abs(best.sec - sec)) best = p;
  }
  return best.bucket;
}

export interface EnrichmentOutput {
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
  triggers?: string[];
  primary_trigger?: string;
}

export function validateEnrichment(output: EnrichmentOutput): { valid: boolean; failureReason?: string; normalized: EnrichmentOutput } {
  const normalized = { ...output };
  normalized.primary_trigger = normalized.primary_trigger ?? '';
  normalized.triggers = normalized.triggers ?? [];

  const rawLang = normalized.language ?? 'en';
  normalized.language = LANGUAGE_ALIASES[rawLang.toLowerCase()] ?? rawLang.replace(/_/g, '-');

  if (Array.isArray(normalized.intents)) {
    normalized.intents = normalized.intents.filter(i => VALID_INTENTS.has(i));
  }
  if (!Array.isArray(normalized.intents) || normalized.intents.length === 0) {
    return { valid: false, failureReason: 'no_intents', normalized };
  }
  if (typeof normalized.intensity !== 'number' || normalized.intensity < 1 || normalized.intensity > 5 || !Number.isInteger(normalized.intensity)) {
    return { valid: false, failureReason: 'invalid_intensity', normalized };
  }
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

export async function callDeepSeek(apiKey: string, row: { raw_title: string; raw_channel_name: string; raw_duration_seconds: number | null; raw_description: string | null }): Promise<EnrichmentOutput> {
  const durationInfo = row.raw_duration_seconds && row.raw_duration_seconds > 0
    ? `Duration: ${row.raw_duration_seconds}s`
    : 'Duration: unknown (estimate from title/description)';

  const prompt = `Classify this YouTube video as ASMR content. Return JSON only, no other text.

Title: ${row.raw_title}
Channel: ${row.raw_channel_name}
${durationInfo}
Description: ${(row.raw_description || '').slice(0, 500)}

Return this exact JSON structure (no markdown, no explanation, just the JSON object):
{"intents":["sleep","relax"],"intensity":3,"format":"ambient","roleplay_scenario":null,"modifiers":[],"duration_bucket":"1-hour","language":"en","confidence":0.85,"is_asmr":true,"why_watch":"REQUIRED. 2-3 sentences. Sentence 1: what specific trigger technique or sound design makes this video distinctive (e.g. close-mic rain on glass, layered tapping at varying speeds). Sentence 2: who it works best for and why (e.g. light sleepers who need consistent volume, students who want zero voice distraction). Sentence 3: one concrete detail about pacing, transitions, or production quality."}

intents must be from: sleep, study, relax, tingles, anxiety, insomnia, meditation, background, adhd, headache, depression, kids, tinnitus

duration_bucket must be one of: 5-minutes, 10-minutes, 15-minutes, 20-minutes, 30-minutes, 1-hour, 2-hours, 3-hours, 4-hours, 8-hours, 10-hours, looped

format must be one of: ambient, roleplay, guided, compilation, tutorial

If format is "roleplay", roleplay_scenario must be one of: medical-roleplay, dentist-roleplay, barber-roleplay, spa-roleplay, library, coffee-shop, hotel-checkin, friend-roleplay, teacher-roleplay, therapist-roleplay, makeup-artist, tattoo-artist, eye-exam, camping, airplane, astrologer-roleplay, fairy-roleplay, vampire-roleplay, elf-roleplay, alien-roleplay, witch-roleplay, robot-roleplay, time-traveler-roleplay, caring-presence, mentor-roleplay

Set is_asmr to false if this is not ASMR content. Set confidence between 0.0 and 1.0.`;

  const MAX_RETRIES = 3;
  const BACKOFF = [2000, 5000, 10000];
  const TIMEOUT_MS = 30_000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat', max_tokens: 400,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, BACKOFF[attempt]));
          continue;
        }
        throw new Error(`DeepSeek API error ${res.status} after ${MAX_RETRIES} retries`);
      }

      if (!res.ok) throw new Error(`DeepSeek API error ${res.status}: ${await res.text()}`);

      const data = await res.json() as any;
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('Empty DeepSeek response');
      const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      return JSON.parse(cleaned);
    } catch (err: any) {
      const errFull = `${String(err)} ${String(err?.cause ?? '')}`;
      const isTransient = err.name === 'AbortError' || /timeout|ECONNRESET|ENOTFOUND|UND_ERR|fetch failed/i.test(errFull);
      if (isTransient && attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, BACKOFF[attempt]));
        continue;
      }
      throw err;
    }
  }

  throw new Error('DeepSeek: exhausted retries');
}
