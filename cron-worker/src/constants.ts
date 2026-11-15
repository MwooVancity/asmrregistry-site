// cron-worker/src/constants.ts

// === Cron-specific constants ===
// Per-invocation caps are bounded by the Cloudflare Workers SUBREQUEST limit
// (50 free / 1000 paid), NOT wall clock. Each enrich row costs ~3 subrequests
// (CAS claim + DeepSeek fetch + batched write), so keep ENRICH_BATCH low enough
// that one daily run (taxonomy searches + ingest fetches + enrich) stays well
// under the cap. The local backfill script (ENRICH_BATCH_LOCAL) has no such cap.
// Free-tier Workers cap each invocation at 50 subrequests. The cron runs ONE
// stage per hourly tick (see runStage / HOUR_PLAN), so each stage must fit under
// 50 on its own. Enrich costs ~3 subrequests/row + ~4 setup → 12 rows ≈ 40.
export const ENRICH_BATCH = 12;          // Worker: ~40 subrequests/run, under 50 cap
export const ENRICH_BATCH_LOCAL = 5000;  // Local script — no subrequest constraint
export const SITEMAP_CAP = 20;
// YouTube 30-day rule: 500 per run x 8 runs a day = 4,000 refreshed a day (60K published + draft needs ~2,000). Per run: 10 API
// calls + 10 D1 batches + 3 queries = 23 subrequests (free cap 50); 80 quota units a day. Not raised: ~4 writes per
// refreshed video, so 1,000 a run would put the daily write total near the 100K free limit.
export const DEAD_CHECK = 500;
// Intake rows older than 30 days deleted per run: 8 runs x 2,500 = 20,000 a day, inside the 100K daily D1 write limit
// alongside the refresh (~4 writes per refreshed video with its indexes).
export const QUEUE_PURGE = 2500;
export const CHANNEL_CAP = 8;            // ~3 fetches/channel → under 50 cap/run
export const TAXONOMY_SEARCH_CAP = 15;  // 15 queries/day → full 175-query cycle in ~12 days
export const GAP_FILL_CAP = 3;

// Retry parameters for DeepSeek enrichment
// Transient errors (429, 5xx, network, empty response) retry up to MAX_ENRICHMENT_RETRIES.
// Validation failures (bad JSON, invalid fields) are non-retryable — mark failed immediately.
export const MAX_ENRICHMENT_RETRIES = 3;

// Semantic drift circuit breaker thresholds
export const CONFIDENCE_DRIFT_THRESHOLD = 0.05;
export const CONFIDENCE_DRIFT_WINDOW_DAYS = 7;

export const WEEKLY_VIRAL_ROTATION = [
  'asmr', 'asmr tapping', 'asmr rain', 'asmr whispering',
  'asmr sleep', 'asmr roleplay', 'asmr no talking', 'asmr mukbang',
];

export const DISCOVERY_QUERIES = [
  'asmr', 'asmr sleep', 'asmr tapping', 'asmr whispering',
  'asmr roleplay', 'asmr no talking', 'asmr anxiety relief', 'asmr studying focus',
];

// "Search Demand First, Videos Second" — 175 queries ordered by proven demand.
// S-tier = highest YouTube search volume (autocomplete-verified).
// Cycles continuously: after full pass, taxonomy_search_index resets to 0.
// All searches use order=viewCount → highest-proven content ingested first.
export const TAXONOMY_QUERIES: Array<{ query: string; tier: 'S' | 'A' | 'B' | 'C' }> = [
  // === S-TIER: Sleep (highest ASMR search intent) ===
  { query: 'asmr for sleep',                      tier: 'S' },
  { query: 'best asmr for sleep',                 tier: 'S' },
  { query: 'asmr sleep 8 hours',                  tier: 'S' },
  { query: 'asmr fall asleep fast',               tier: 'S' },
  { query: 'asmr overnight sleep no talking',     tier: 'S' },

  // === S-TIER: Rain ===
  { query: 'asmr rain',                           tier: 'S' },
  { query: 'asmr rain for sleep',                 tier: 'S' },
  { query: 'asmr rain no talking',                tier: 'S' },
  { query: 'asmr rain study background',          tier: 'S' },
  { query: 'asmr rain 8 hours',                   tier: 'S' },
  { query: 'asmr rain thunderstorm',              tier: 'S' },
  { query: 'asmr rain cozy window',               tier: 'S' },

  // === S-TIER: Whispering ===
  { query: 'asmr whispering',                     tier: 'S' },
  { query: 'asmr whispering for sleep',           tier: 'S' },
  { query: 'asmr whispering close ear tingles',   tier: 'S' },
  { query: 'asmr whispering 1 hour',              tier: 'S' },
  { query: 'asmr soft whispering relaxing',       tier: 'S' },

  // === S-TIER: Tapping ===
  { query: 'asmr tapping',                        tier: 'S' },
  { query: 'asmr tapping no talking',             tier: 'S' },
  { query: 'asmr tapping for sleep',              tier: 'S' },
  { query: 'asmr tapping satisfying',             tier: 'S' },
  { query: 'asmr tapping intense tingles',        tier: 'S' },
  { query: 'asmr tapping nails glass wood',       tier: 'S' },
  { query: 'asmr tapping keyboard typing',        tier: 'S' },

  // === A-TIER: Soft Speaking ===
  { query: 'asmr soft spoken',                    tier: 'A' },
  { query: 'asmr soft spoken for sleep',          tier: 'A' },
  { query: 'asmr soft speaking reading',          tier: 'A' },

  // === A-TIER: Typing / Keyboard ===
  { query: 'asmr typing',                         tier: 'A' },
  { query: 'asmr typing keyboard study',          tier: 'A' },
  { query: 'asmr typing no talking 1 hour',       tier: 'A' },
  { query: 'asmr keyboard clicky satisfying',     tier: 'A' },
  { query: 'asmr keyboard typing background',     tier: 'A' },

  // === A-TIER: White Noise ===
  { query: 'asmr white noise',                    tier: 'A' },
  { query: 'asmr white noise for sleep',          tier: 'A' },
  { query: 'asmr white noise study',              tier: 'A' },
  { query: 'asmr white noise 8 hours',            tier: 'A' },

  // === A-TIER: Scratching ===
  { query: 'asmr scratching',                     tier: 'A' },
  { query: 'asmr scratching no talking tingles',  tier: 'A' },
  { query: 'asmr scratching intense',             tier: 'A' },

  // === A-TIER: Ocean ===
  { query: 'asmr ocean waves',                    tier: 'A' },
  { query: 'asmr ocean waves for sleep',          tier: 'A' },
  { query: 'asmr ocean meditation',               tier: 'A' },
  { query: 'asmr ocean beach 8 hours',            tier: 'A' },

  // === A-TIER: No Talking ===
  { query: 'asmr no talking',                     tier: 'A' },
  { query: 'asmr no talking for sleep',           tier: 'A' },
  { query: 'asmr no talking study',               tier: 'A' },
  { query: 'asmr no talking scratching',          tier: 'A' },

  // === A-TIER: Nature ===
  { query: 'asmr nature sounds',                  tier: 'A' },
  { query: 'asmr nature sounds for sleep',        tier: 'A' },
  { query: 'asmr forest birds rain',              tier: 'A' },
  { query: 'asmr nature meditation',              tier: 'A' },

  // === A-TIER: Eating Sounds ===
  { query: 'asmr eating sounds',                  tier: 'A' },
  { query: 'asmr mukbang eating',                 tier: 'A' },
  { query: 'asmr eating crunchy no talking',      tier: 'A' },
  { query: 'asmr eating chips crackers',          tier: 'A' },

  // === A-TIER: Hair Play ===
  { query: 'asmr hair brushing',                  tier: 'A' },
  { query: 'asmr hair play tingles',              tier: 'A' },
  { query: 'asmr scalp massage hair brushing',    tier: 'A' },

  // === A-TIER: Personal Attention ===
  { query: 'asmr personal attention',             tier: 'A' },
  { query: 'asmr personal attention tingles',     tier: 'A' },
  { query: 'asmr caring personal attention',      tier: 'A' },

  // === A-TIER: Fire / Fireplace ===
  { query: 'asmr fireplace crackling',            tier: 'A' },
  { query: 'asmr fire for sleep',                 tier: 'A' },
  { query: 'asmr fireplace cozy winter',          tier: 'A' },

  // === A-TIER: Intent — Anxiety / Study / Relax ===
  { query: 'asmr anxiety relief',                 tier: 'A' },
  { query: 'asmr calming anxiety panic',          tier: 'A' },
  { query: 'asmr for studying focus',             tier: 'A' },
  { query: 'asmr study background 1 hour',        tier: 'A' },
  { query: 'asmr for adhd focus concentration',   tier: 'A' },
  { query: 'asmr relaxing no talking',            tier: 'A' },
  { query: 'asmr insomnia relief',                tier: 'A' },

  // === A-TIER: Roleplay (low comp for directory) ===
  { query: 'asmr roleplay',                       tier: 'A' },
  { query: 'asmr doctor roleplay',                tier: 'A' },
  { query: 'asmr spa roleplay',                   tier: 'A' },
  { query: 'asmr dentist roleplay',               tier: 'A' },
  { query: 'asmr barber roleplay',                tier: 'A' },
  { query: 'asmr friend roleplay',                tier: 'A' },
  { query: 'asmr girlfriend roleplay caring',     tier: 'A' },

  // === A-TIER: Duration ===
  { query: 'asmr 1 hour',                         tier: 'A' },
  { query: 'asmr 2 hours sleep',                  tier: 'A' },
  { query: 'asmr 8 hours sleep looped',           tier: 'A' },

  // === A-TIER: Language niches ===
  { query: 'korean asmr',                         tier: 'A' },
  { query: 'japanese asmr whisper',               tier: 'A' },

  // === B-TIER: Specific triggers ===
  { query: 'asmr mouth sounds tingles',           tier: 'B' },
  { query: 'asmr mouth sounds no talking',        tier: 'B' },
  { query: 'asmr kisses tingles',                 tier: 'B' },
  { query: 'asmr breathing sleep',                tier: 'B' },
  { query: 'asmr breathing anxiety relief',       tier: 'B' },
  { query: 'asmr massage relaxing',               tier: 'B' },
  { query: 'asmr massage sleep tingles',          tier: 'B' },
  { query: 'asmr reading book soft spoken',       tier: 'B' },
  { query: 'asmr writing pen paper sounds',       tier: 'B' },
  { query: 'asmr cooking sounds relaxing',        tier: 'B' },
  { query: 'asmr cooking no talking',             tier: 'B' },
  { query: 'asmr brush microphone tingles',       tier: 'B' },
  { query: 'asmr crinkling plastic paper',        tier: 'B' },
  { query: 'asmr page turning book magazine',     tier: 'B' },
  { query: 'asmr clicking satisfying',            tier: 'B' },
  { query: 'binaural asmr 3d audio tingles',      tier: 'B' },
  { query: 'asmr binaural headphones intense',    tier: 'B' },
  { query: 'asmr water sounds pouring',           tier: 'B' },
  { query: 'asmr water rain stream',              tier: 'B' },
  { query: 'asmr positive affirmations sleep',    tier: 'B' },
  { query: 'asmr glass sounds tingles',           tier: 'B' },

  // === B-TIER: Roleplay niches ===
  { query: 'asmr big sister roleplay',            tier: 'B' },
  { query: 'asmr librarian roleplay',             tier: 'B' },
  { query: 'asmr coffee shop ambient',            tier: 'B' },
  { query: 'asmr hotel check in roleplay',        tier: 'B' },
  { query: 'asmr therapist roleplay',             tier: 'B' },
  { query: 'asmr makeup artist roleplay',         tier: 'B' },
  { query: 'asmr eye exam roleplay',              tier: 'B' },

  // === B-TIER: Mental health ===
  { query: 'asmr depression comfort caring',      tier: 'B' },
  { query: 'asmr for headache relief',            tier: 'B' },
  { query: 'asmr migraine relief gentle',         tier: 'B' },
  { query: 'asmr tinnitus masking white noise',   tier: 'B' },
  { query: 'asmr tinnitus relief',                tier: 'B' },

  // === B-TIER: Kids ===
  { query: 'asmr for kids bedtime',               tier: 'B' },
  { query: 'asmr gentle kids calm',               tier: 'B' },
  { query: 'asmr kids sleep story',               tier: 'B' },

  // === B-TIER: Duration / Format ===
  { query: 'asmr 3 hours background',             tier: 'B' },
  { query: 'asmr 10 hours white noise sleep',     tier: 'B' },
  { query: 'asmr looped ambient background',      tier: 'B' },
  { query: 'asmr compilation best tingles',       tier: 'B' },
  { query: 'asmr 30 minutes relaxing',            tier: 'B' },

  // === B-TIER: Language niches ===
  { query: 'spanish asmr whispering',             tier: 'B' },
  { query: 'french asmr soft spoken',             tier: 'B' },
  { query: 'german asmr',                         tier: 'B' },

  // === B-TIER: Long-tail specifics (proven autocomplete demand) ===
  { query: 'asmr soap cutting satisfying',        tier: 'B' },
  { query: 'asmr nail tapping fingers',           tier: 'B' },
  { query: 'asmr pencil writing notebook',        tier: 'B' },
  { query: 'asmr crinkle bag chips sounds',       tier: 'B' },
  { query: 'asmr rain on tent camping',           tier: 'B' },
  { query: 'asmr thunderstorm 8 hours',           tier: 'B' },
  { query: 'asmr library studying quiet',         tier: 'B' },
  { query: 'asmr unboxing sounds satisfying',     tier: 'B' },
  { query: 'asmr cozy autumn rain',               tier: 'B' },
  { query: 'asmr christmas fireplace cozy',       tier: 'B' },

  // === B-TIER: Creator / best-of ===
  { query: 'best asmr creators 2024',             tier: 'B' },
  { query: 'best asmr channels for sleep',        tier: 'B' },
  { query: 'top asmr youtubers',                  tier: 'B' },
  { query: 'best asmr microphone',                tier: 'B' },
  { query: 'best headphones for asmr',            tier: 'B' },

  // === C-TIER: Remaining triggers ===
  { query: 'asmr sand satisfying',                tier: 'C' },
  { query: 'asmr slime satisfying no talking',    tier: 'C' },
  { query: 'asmr painting brush sounds',          tier: 'C' },
  { query: 'asmr spraying bottle sounds',         tier: 'C' },
  { query: 'asmr folding clothes sounds',         tier: 'C' },
  { query: 'asmr counting sheep sleep',           tier: 'C' },
  { query: 'asmr light visual relaxing',          tier: 'C' },

  // === C-TIER: Fantasy roleplay ===
  { query: 'asmr tattoo artist roleplay',         tier: 'C' },
  { query: 'asmr witch roleplay fantasy',         tier: 'C' },
  { query: 'asmr vampire roleplay',               tier: 'C' },
  { query: 'asmr fairy roleplay magical',         tier: 'C' },
  { query: 'asmr alien roleplay',                 tier: 'C' },
  { query: 'asmr time traveler roleplay',         tier: 'C' },

  // === C-TIER: Language niches ===
  { query: 'portuguese asmr',                     tier: 'C' },
  { query: 'italian asmr whisper',                tier: 'C' },
  { query: 'dutch asmr',                          tier: 'C' },

  // === C-TIER: Remaining long-tails ===
  { query: 'asmr woodworking carving sounds',     tier: 'C' },
  { query: 'asmr snow winter falling',            tier: 'C' },
  { query: 'asmr summer beach ocean sounds',      tier: 'C' },
  { query: 'asmr binaural microphone recording',  tier: 'C' },
];

// === Shared constants (copied from src/lib/constants.ts — cannot import across Astro/Worker boundary) ===

export const VALID_TRIGGERS = new Set([
  'tapping', 'scratching', 'whispering', 'soft-speaking', 'typing',
  'crinkling', 'page-turning', 'brushing', 'hair-play', 'eating-sounds',
  'mouth-sounds', 'kisses', 'rain', 'ocean', 'fire', 'nature', 'writing', 'cooking',
  'soap-carving', 'sand', 'slime', 'water-sounds', 'massage', 'breathing',
  'reading', 'painting', 'clicking', 'spraying', 'folding', 'glass-sounds',
  'binaural', 'white-noise', 'no-talking', 'positive-affirmations',
  'counting', 'personal-attention', 'light-patterns',
]);

export const VALID_INTENTS = new Set([
  'sleep', 'study', 'relax', 'tingles', 'anxiety', 'insomnia',
  'meditation', 'background', 'adhd', 'headache', 'depression',
  'kids', 'tinnitus',
]);

export const VALID_DURATIONS = new Set([
  '5-minutes', '10-minutes', '15-minutes', '20-minutes', '30-minutes',
  '1-hour', '2-hours', '3-hours', '4-hours', '8-hours', '10-hours', 'looped',
]);

export const VALID_ROLEPLAY_SCENARIOS = new Set([
  'medical-roleplay', 'dentist-roleplay', 'barber-roleplay', 'spa-roleplay',
  'library', 'coffee-shop', 'hotel-checkin', 'friend-roleplay',
  'teacher-roleplay', 'therapist-roleplay', 'makeup-artist', 'tattoo-artist',
  'eye-exam', 'camping', 'airplane', 'astrologer-roleplay',
  'fairy-roleplay', 'vampire-roleplay', 'elf-roleplay', 'alien-roleplay',
  'witch-roleplay', 'robot-roleplay', 'time-traveler-roleplay',
  'caring-presence', 'mentor-roleplay',
]);

export const TRIGGER_TIER_MAP: Record<string, 'S' | 'A' | 'B' | 'C'> = {
  'rain': 'S', 'whispering': 'S', 'tapping': 'S',
  'soft-speaking': 'A', 'typing': 'A', 'white-noise': 'A', 'scratching': 'A',
  'ocean': 'A', 'no-talking': 'A', 'nature': 'A', 'eating-sounds': 'A',
  'hair-play': 'A', 'personal-attention': 'A', 'fire': 'A',
  'mouth-sounds': 'B', 'kisses': 'B', 'breathing': 'B', 'massage': 'B', 'reading': 'B',
  'writing': 'B', 'cooking': 'B', 'brushing': 'B', 'crinkling': 'B',
  'page-turning': 'B', 'clicking': 'B', 'binaural': 'B', 'water-sounds': 'B',
  'positive-affirmations': 'B', 'glass-sounds': 'B',
  'sand': 'C', 'slime': 'C', 'soap-carving': 'C', 'painting': 'C',
  'spraying': 'C', 'folding': 'C', 'counting': 'C', 'light-patterns': 'C',
};

export const TRIGGER_INTENT_MAP: Record<string, string[]> = {
  'tapping':              ['tingles', 'sleep', 'relax'],
  'whispering':           ['sleep', 'tingles', 'relax'],
  'rain':                 ['sleep', 'study', 'relax', 'background'],
  'soft-speaking':        ['sleep', 'relax', 'study'],
  'typing':               ['study', 'background', 'sleep'],
  'white-noise':          ['sleep', 'study', 'tinnitus', 'background', 'adhd'],
  'scratching':           ['tingles', 'sleep', 'relax'],
  'ocean':                ['sleep', 'meditation', 'relax'],
  'no-talking':           ['sleep', 'study', 'background', 'tinnitus', 'adhd'],
  'nature':               ['sleep', 'meditation', 'relax', 'background'],
  'eating-sounds':        ['relax', 'tingles'],
  'hair-play':            ['sleep', 'tingles', 'relax'],
  'personal-attention':   ['relax', 'depression', 'tingles'],
  'fire':                 ['sleep', 'relax', 'study'],
  'mouth-sounds':         ['tingles', 'sleep'],
  'breathing':            ['anxiety', 'sleep', 'meditation'],
  'massage':              ['sleep', 'relax', 'tingles'],
  'reading':              ['sleep', 'relax', 'study'],
  'writing':              ['study', 'sleep', 'relax'],
  'cooking':              ['relax', 'background'],
  'brushing':             ['tingles', 'sleep', 'relax'],
  'crinkling':            ['tingles', 'relax'],
  'page-turning':         ['study', 'sleep', 'relax'],
  'clicking':             ['tingles', 'relax'],
  'binaural':             ['tingles', 'sleep'],
  'water-sounds':         ['sleep', 'relax', 'meditation'],
  'positive-affirmations':['depression', 'anxiety', 'sleep', 'meditation'],
  'glass-sounds':         ['tingles', 'relax'],
  'sand':                 ['tingles', 'relax'],
  'slime':                ['tingles', 'relax'],
  'soap-carving':         ['tingles', 'relax'],
  'painting':             ['relax', 'study', 'background'],
  'spraying':             ['tingles', 'relax'],
  'folding':              ['relax', 'sleep', 'background'],
  'counting':             ['sleep', 'insomnia'],
  'light-patterns':       ['sleep', 'relax', 'meditation'],
};

export const TRIGGER_KEYWORDS: Record<string, string[]> = {
  'tapping':              ['tap', 'tapping', 'taps'],
  'scratching':           ['scratch', 'scratching'],
  'whispering':           ['whisper', 'whispering', 'whispers'],
  'soft-speaking':        ['soft spoken', 'softly spoken', 'soft voice', 'gentle voice', 'quiet voice', 'calm voice'],
  'typing':               ['typing', 'keyboard', 'typewriter'],
  'crinkling':            ['crinkle', 'crinkling'],
  'page-turning':         ['page turning', 'page flip', 'flipping pages'],
  'brushing':             ['brushing', 'brush strokes'],
  'hair-play':            ['hair brushing', 'hair play', 'hair touching', 'hair stroking', 'scalp'],
  'eating-sounds':        ['eating', 'mukbang', 'chewing', 'crunching', 'snacking'],
  'mouth-sounds':         ['mouth sounds', 'lip smacking'],
  'kisses':               ['kiss', 'kisses', 'kissing'],
  'rain':                 ['rain', 'rainfall', 'rainstorm', 'thunderstorm', 'thunder', 'drizzle'],
  'ocean':                ['ocean', 'waves', 'beach', 'sea', 'tide'],
  'fire':                 ['fire', 'fireplace', 'campfire', 'flame', 'hearth', 'crackling'],
  'nature':               ['nature', 'forest', 'birds', 'outdoor', 'jungle', 'wind'],
  'writing':              ['writing', 'pen', 'pencil'],
  'cooking':              ['cooking', 'kitchen', 'chopping'],
  'soap-carving':         ['soap carving'],
  'sand':                 ['sand', 'sandy'],
  'slime':                ['slime'],
  'water-sounds':         ['water', 'dripping', 'pouring', 'fountain'],
  'massage':              ['massage', 'massaging'],
  'breathing':            ['breathing', 'breath'],
  'reading':              ['reading aloud', 'read aloud', 'bedtime story', 'story time'],
  'painting':             ['painting', 'drawing', 'art'],
  'clicking':             ['clicking', 'mouse clicks'],
  'spraying':             ['spraying', 'misting', 'spray'],
  'folding':              ['folding', 'origami'],
  'glass-sounds':         ['glass', 'crystal bowl', 'singing bowl'],
  'binaural':             ['binaural'],
  'white-noise':          ['white noise', 'fan noise', 'static'],
  'no-talking':           ['no talking', 'no speaking'],
  'positive-affirmations':['affirmations', 'affirmation'],
  'counting':             ['counting', 'countdown'],
  'personal-attention':   ['personal attention', 'cranial nerve', 'dentist', 'doctor', 'nurse', 'barista', 'haircut', 'spa', 'eye exam', 'sleep clinic', 'makeup artist', 'face touching', 'measuring you', 'tucking you in'],
  'light-patterns':       ['light triggers', 'visual triggers'],
};

export const TRIGGER_GROUPS: Record<string, string[]> = {
  'Nature':         ['rain', 'ocean', 'fire', 'nature', 'water-sounds', 'sand'],
  'Voice':          ['whispering', 'soft-speaking', 'reading', 'counting', 'positive-affirmations'],
  'Touch':          ['tapping', 'scratching', 'brushing', 'hair-play', 'massage', 'personal-attention'],
  'Desk & Objects': ['typing', 'clicking', 'writing', 'painting', 'folding', 'page-turning', 'glass-sounds'],
  'Materials':      ['crinkling', 'slime', 'soap-carving', 'spraying', 'cooking'],
  'Mouth':          ['eating-sounds', 'mouth-sounds', 'kisses'],
  'Ambient':        ['binaural', 'white-noise', 'no-talking', 'breathing', 'light-patterns'],
};

// One word-boundary regex per trigger, compiled once (matchTriggers runs per video).
const TRIGGER_RES: [string, RegExp][] = Object.entries(TRIGGER_KEYWORDS).map(([t, kws]) =>
  [t, new RegExp(`\\b(?:${kws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i')]);

// Title matches outrank description matches: descriptions carry channel boilerplate
// (a mukbang channel's link list made every video primary_trigger = hair-play).
// Within the title, the trigger named first leads ("Hair play and scratching" = hair-play).
// Single source of truth: scripts/lib/enrichment.ts re-exports this.
export function matchTriggers(title: string, description?: string): string[] {
  const fromTitle = TRIGGER_RES.map(([t, re]) => [t, title.search(re)] as [string, number])
    .filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([t]) => t);
  const fromDesc = description ? TRIGGER_RES.filter(([t, re]) => !fromTitle.includes(t) && re.test(description)).map(([t]) => t) : [];
  return [...fromTitle, ...fromDesc];
}

// Deterministic duration_bucket from the real video length. We already have the
// exact seconds from YouTube, so derive the bucket instead of trusting the model
// (which drifted to out-of-enum values → invalid_duration_bucket drops). Returns
// the nearest valid labeled bucket. Shorts (<300s) are rejected upstream.
const DURATION_BUCKET_POINTS: Array<{ bucket: string; sec: number }> = [
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

export const LANGUAGE_ALIASES: Record<string, string> = {
  'english': 'en', 'eng': 'en',
  'spanish': 'es', 'french': 'fr', 'german': 'de',
  'japanese': 'ja', 'korean': 'ko', 'portuguese': 'pt',
  'italian': 'it', 'chinese': 'zh', 'dutch': 'nl',
};
