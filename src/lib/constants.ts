// src/lib/constants.ts

export const VALID_TRIGGERS = new Set([
  'tapping', 'scratching', 'whispering', 'soft-speaking', 'typing',
  'crinkling', 'page-turning', 'brushing', 'hair-play', 'eating-sounds',
  'mouth-sounds', 'kisses', 'rain', 'ocean', 'fire', 'nature', 'writing', 'cooking',
  'soap-carving', 'sand', 'slime', 'water-sounds', 'massage', 'breathing',
  'reading', 'painting', 'clicking', 'spraying', 'folding', 'glass-sounds',
  'binaural', 'white-noise', 'no-talking', 'positive-affirmations',
  'counting', 'personal-attention', 'light-patterns',
]);

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
  'rain':                 ['rain', 'rainfall', 'rainstorm', 'thunderstorm', 'drizzle'],
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

export function matchTriggers(title: string): string[] {
  const matched: string[] = [];
  for (const [trigger, keywords] of Object.entries(TRIGGER_KEYWORDS)) {
    if (keywords.some(kw => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title))) {
      matched.push(trigger);
    }
  }
  return matched;
}

export const VALID_INTENTS = new Set([
  'sleep', 'study', 'relax', 'tingles', 'anxiety', 'insomnia',
  'meditation', 'background', 'adhd', 'headache', 'depression',
  'kids', 'tinnitus',
]);

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
  'kisses':               ['tingles', 'relax'],
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

export const RELATED_TRIGGERS: Record<string, string[]> = {
  'tapping':              ['scratching', 'clicking', 'typing'],
  'scratching':           ['tapping', 'brushing', 'hair-play'],
  'whispering':           ['soft-speaking', 'mouth-sounds', 'breathing'],
  'soft-speaking':        ['whispering', 'reading'],
  'typing':               ['tapping', 'clicking', 'writing'],
  'crinkling':            ['tapping', 'page-turning'],
  'page-turning':         ['reading', 'writing', 'library'],
  'brushing':             ['scratching', 'tapping', 'hair-play'],
  'hair-play':            ['brushing', 'massage', 'spa'],
  'eating-sounds':        ['mouth-sounds', 'cooking'],
  'mouth-sounds':         ['eating-sounds', 'whispering'],
  'kisses':               ['mouth-sounds', 'whispering', 'personal-attention'],
  'rain':                 ['ocean', 'nature', 'fire'],
  'ocean':                ['rain', 'nature', 'fire'],
  'fire':                 ['rain', 'nature', 'ocean'],
  'nature':               ['rain', 'ocean', 'fire'],
  'writing':              ['page-turning', 'typing'],
  'cooking':              ['eating-sounds', 'tapping', 'water-sounds'],
  'soap-carving':         ['tapping', 'crinkling', 'sand'],
  'sand':                 ['soap-carving', 'slime'],
  'slime':                ['sand', 'soap-carving'],
  'water-sounds':         ['ocean', 'rain', 'cooking'],
  'massage':              ['hair-play', 'breathing'],
  'breathing':            ['meditation', 'whispering'],
  'reading':              ['soft-speaking', 'page-turning', 'whispering'],
  'painting':             ['writing', 'brushing', 'tapping'],
  'clicking':             ['tapping', 'typing'],
  'spraying':             ['water-sounds', 'brushing'],
  'folding':              ['crinkling'],
  'glass-sounds':         ['tapping', 'water-sounds'],
  'binaural':             ['whispering', 'tapping', 'scratching'],
  'white-noise':          ['rain', 'nature'],
  'no-talking':           ['nature', 'rain'],
  'positive-affirmations':['whispering', 'soft-speaking'],
  'counting':             ['whispering', 'soft-speaking'],
  'personal-attention':   ['massage', 'friend-roleplay'],
  'light-patterns':       ['no-talking'],
};

export const YMYL_INTENTS = new Set([
  'depression', 'anxiety', 'headache', 'adhd', 'tinnitus', 'insomnia', 'kids',
]);

// URL slug → display label for roleplay scenarios
// DB stores e.g. 'barber-roleplay'; hub_intelligence converts to 'roleplay/barber'
export const ROLEPLAY_SCENARIO_LABELS: Record<string, string> = {
  'medical':        'Medical Exam',
  'dentist':        'Dentist',
  'barber':         'Barber',
  'spa':            'Spa',
  'library':        'Library',
  'coffee-shop':    'Coffee Shop',
  'hotel-checkin':  'Hotel Check-In',
  'friend':         'Friend',
  'teacher':        'Teacher',
  'therapist':      'Therapist',
  'makeup-artist':  'Makeup Artist',
  'tattoo-artist':  'Tattoo Artist',
  'eye-exam':       'Eye Exam',
  'camping':        'Camping',
  'airplane':       'Airplane',
  'astrologer':     'Astrologer',
  'fairy':          'Fairy',
  'vampire':        'Vampire',
  'elf':            'Elf',
  'alien':          'Alien',
  'witch':          'Witch',
  'robot':          'Robot',
  'time-traveler':  'Time Traveler',
  'caring-presence':'Caring Presence',
  'mentor':         'Mentor',
};

export const VALID_ROLEPLAY_SLUGS = new Set(Object.keys(ROLEPLAY_SCENARIO_LABELS));



