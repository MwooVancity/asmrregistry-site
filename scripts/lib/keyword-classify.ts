// scripts/lib/keyword-classify.ts — zero-cost classification from title/channel/description.
// Drop-in replacement for callDeepSeek(): same EnrichmentOutput shape, no network, no API key.
//
// Honest-signal design: confidence is derived from how much real evidence the text
// carries, NOT hardcoded. Videos with no ASMR signal score below the 0.7 publish
// gate and land in draft/rejected instead of on the site. This matters because the
// ingest queue is full of non-ASMR channels (gaming, food vlogs, motivational talks)
// pulled in by discovery.
//
// why_watch is left null on purpose. Templating editorial prose across 500 videos/day
// would be scaled thin content; the registry's value is the classification, and
// src/pages/video/[id].astro renders why_watch conditionally so null is safe.

import { matchTriggers, type EnrichmentOutput } from './enrichment.js';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// One alternation regex per category, compiled once at module load.
const compile = (kws: string[]) => new RegExp(`\\b(?:${kws.map(esc).join('|')})\\b`, 'i');

const INTENT_KEYWORDS: Record<string, string[]> = {
  sleep: ['sleep', 'sleeping', 'asleep', 'bedtime', 'night', 'deep sleep', 'fall asleep', 'sleep aid'],
  study: ['study', 'studying', 'focus', 'concentration', 'homework', 'revision'],
  relax: ['relax', 'relaxing', 'relaxation', 'calm', 'calming', 'unwind', 'chill', 'soothing'],
  tingles: ['tingles', 'tingle', 'tingly', 'goosebumps', 'brain massage', 'brain tingles'],
  anxiety: ['anxiety', 'anxious', 'stress', 'stressed', 'stress relief', 'panic'],
  insomnia: ['insomnia', "can't sleep", 'cant sleep', 'sleepless'],
  meditation: ['meditation', 'meditate', 'mindfulness', 'zen', 'yoga nidra'],
  background: ['background', 'ambience', 'ambient', 'ambiance', 'background noise'],
  adhd: ['adhd'],
  headache: ['headache', 'migraine'],
  depression: ['depression', 'depressed'],
  kids: ['kids', 'children', 'baby', 'babies', 'toddler', 'nursery', 'lullaby'],
  tinnitus: ['tinnitus'],
};
const INTENT_RE: [string, RegExp][] = Object.entries(INTENT_KEYWORDS).map(([k, v]) => [k, compile(v)]);

const ROLEPLAY_KEYWORDS: Record<string, string[]> = {
  'dentist-roleplay': ['dentist', 'dental', 'teeth cleaning'],
  'eye-exam': ['eye exam', 'optometrist', 'vision test'],
  'medical-roleplay': ['doctor', 'medical', 'nurse', 'hospital', 'clinic', 'checkup', 'check up', 'examination', 'cranial nerve'],
  'barber-roleplay': ['barber', 'haircut', 'hair cut', 'salon', 'shave'],
  'spa-roleplay': ['spa', 'facial', 'massage therapist'],
  'makeup-artist': ['makeup', 'make up artist'],
  'tattoo-artist': ['tattoo'],
  'library': ['library', 'librarian'],
  'coffee-shop': ['coffee shop', 'cafe', 'café', 'barista'],
  'hotel-checkin': ['hotel', 'receptionist', 'concierge', 'check-in'],
  'teacher-roleplay': ['teacher', 'tutor', 'classroom'],
  'therapist-roleplay': ['therapist', 'therapy', 'counselor', 'psychologist'],
  'astrologer-roleplay': ['astrologer', 'astrology', 'tarot', 'horoscope'],
  'fairy-roleplay': ['fairy', 'fae'],
  'vampire-roleplay': ['vampire'],
  'elf-roleplay': ['elf', 'elven'],
  'alien-roleplay': ['alien', 'extraterrestrial'],
  'witch-roleplay': ['witch', 'potion', 'apothecary'],
  'robot-roleplay': ['robot', 'android'],
  'time-traveler-roleplay': ['time travel', 'time traveler'],
  'airplane': ['airplane', 'flight attendant', 'airline'],
  'camping': ['camping', 'tent', 'campsite'],
  'mentor-roleplay': ['mentor', 'life coach'],
  'friend-roleplay': ['friend', 'sleepover'],
  'caring-presence': ['taking care of you', 'caring for you', 'comfort you', 'looking after you'],
};
// Specific scenarios first — 'dentist' must win before the broader 'medical' list.
const ROLEPLAY_RE: [string, RegExp][] = Object.entries(ROLEPLAY_KEYWORDS).map(([k, v]) => [k, compile(v)]);

const RE_ASMR       = /\basmr\b/i;
const RE_ROLEPLAY   = /\b(?:roleplay|role play|rp)\b/i;
const RE_GUIDED     = /\b(?:guided|hypnosis|hypnotic|affirmations?)\b/i;
const RE_COMPILATION = /\b(?:compilation|best of|top \d+|megamix|mega mix)\b/i;
const RE_TUTORIAL   = /\b(?:tutorial|how to|guide to|explained)\b/i;

// Triggers whose sound profile is low-arousal vs. polarizing/high-arousal.
const CALM_TRIGGERS = new Set(['rain', 'ocean', 'fire', 'nature', 'white-noise', 'no-talking', 'water-sounds', 'breathing', 'binaural', 'glass-sounds']);
const INTENSE_TRIGGERS = new Set(['eating-sounds', 'mouth-sounds', 'kisses']);

// Standalone sound beds — a video built on one of these IS sleep audio. Deliberately
// narrower than CALM_TRIGGERS: 'breathing' and 'no-talking' describe a delivery style,
// not a soundscape, so they can't carry the no-"ASMR"-in-the-title branch on their own.
const AMBIENT_SOUND_TRIGGERS = new Set(['rain', 'ocean', 'fire', 'nature', 'white-noise', 'water-sounds', 'binaural']);

// Script detection. Kana is checked before Han because Japanese text contains both.
// ponytail: Latin-script languages all fall through to 'en'. Distinguishing es/pt/fr/de
// needs stopword scoring; add it if the language facet shows a bogus 'en' skew.
function detectLanguage(text: string): string {
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[฀-๿]/.test(text)) return 'th';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  return 'en';
}

export interface ClassifyInput {
  raw_title: string;
  raw_channel_name: string | null;
  raw_duration_seconds: number | null;
  raw_description: string | null;
}

export function classifyByKeyword(row: ClassifyInput): EnrichmentOutput {
  const title = row.raw_title ?? '';
  const channel = row.raw_channel_name ?? '';
  // Cap description: past ~600 chars it's links, timestamps and boilerplate that
  // produce false keyword hits ("subscribe", "business inquiries").
  const desc = (row.raw_description ?? '').slice(0, 600);
  const text = `${title} ${desc}`;
  const durSec = row.raw_duration_seconds ?? 0;

  const triggers = matchTriggers(title, desc);

  const asmrInTitle = RE_ASMR.test(title);
  const asmrInChannel = RE_ASMR.test(channel);
  const asmrInDesc = RE_ASMR.test(desc);

  let intents = INTENT_RE.filter(([, re]) => re.test(text)).map(([k]) => k);
  const intentsFromKeywords = intents.length > 0;

  // Long-form ambient sleep/rain/fire content is on-topic for the registry even when
  // the uploader never types "ASMR". Corroboration is an actual soundscape trigger plus
  // 20+ minutes plus a sleep-family intent — keyed on AMBIENT_SOUND_TRIGGERS rather than
  // any trigger, so "chopping vegetables, relaxing" doesn't sneak through on 'cooking'.
  const ambientSleepContent =
    triggers.some(t => AMBIENT_SOUND_TRIGGERS.has(t)) &&
    durSec >= 1200 &&
    intents.some(i => ['sleep', 'relax', 'insomnia', 'meditation', 'background'].includes(i));

  const is_asmr = asmrInTitle || asmrInChannel || asmrInDesc || ambientSleepContent;

  // Fall back to what the duration implies, but only once we already believe it's ASMR.
  if (intents.length === 0 && is_asmr) {
    intents = durSec >= 3600 ? ['sleep', 'relax'] : ['relax', 'tingles'];
  }

  // Confidence = weight of evidence. The 0.7 publish gate is the decision point.
  let confidence = 0.5;
  if (asmrInTitle) confidence += 0.25;
  if (asmrInChannel) confidence += 0.10;
  if (!asmrInTitle && !asmrInChannel && asmrInDesc) confidence += 0.05;
  if (triggers.length >= 1) confidence += 0.10;
  if (triggers.length >= 3) confidence += 0.05;
  if (intentsFromKeywords) confidence += 0.10;
  if (ambientSleepContent) confidence += 0.10;
  if (!is_asmr) confidence = Math.min(confidence, 0.3);
  confidence = Math.round(Math.min(confidence, 0.95) * 100) / 100;

  let format = 'ambient';
  let roleplay_scenario: string | null = null;
  const scenarioHit = ROLEPLAY_RE.find(([, re]) => re.test(text));
  if (RE_ROLEPLAY.test(text) || scenarioHit) {
    roleplay_scenario = scenarioHit?.[0] ?? null;
    // validateEnrichment rejects format=roleplay with no valid scenario, so a
    // "roleplay" video we can't place stays ambient rather than failing outright.
    format = roleplay_scenario ? 'roleplay' : 'ambient';
  } else if (RE_GUIDED.test(text)) format = 'guided';
  else if (RE_COMPILATION.test(text)) format = 'compilation';
  else if (RE_TUTORIAL.test(text)) format = 'tutorial';

  let intensity = 3;
  if (triggers.some(t => INTENSE_TRIGGERS.has(t))) intensity = 4;
  else if (triggers.length > 0 && triggers.every(t => CALM_TRIGGERS.has(t))) intensity = 2;

  return {
    intents,
    intensity,
    format,
    roleplay_scenario,
    modifiers: [],
    duration_bucket: '1-hour', // overwritten downstream by bucketFromSeconds when duration is known
    language: detectLanguage(`${title} ${channel}`),
    confidence,
    is_asmr,
    why_watch: undefined,
    triggers,
    primary_trigger: triggers[0] ?? '',
  };
}
