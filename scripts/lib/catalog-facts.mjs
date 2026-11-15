// Per-page catalog facts for the Unique Data rule: one pass over the videos prebuild-hub-data already fetched, no extra
// D1 reads. A page gets facts only when its slice has 30+ videos (CLAUDE.md: no percentages under 30).
// YouTube titles arrive HTML-encoded ("&amp;"); the page encodes again, so decode once at build.
const ENT = { '&amp;': '&', '&#39;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>' };
export const decodeHtml = (s) => String(s ?? '').replace(/&(amp|#39|quot|lt|gt);/g, (m) => ENT[m]);

const rx = (re) => (v) => re.test(v.title);
const scen = (...s) => (v) => s.includes(v.roleplay_scenario);
const intent = (i) => (v) => String(v.intents).includes(`"${i}"`);
const trig = (t) => (v) => v.primary_trigger === t;
const lang = (...l) => (v) => l.includes(v.language);
const all = () => true;

// Slug -> which videos the page is about. Trigger and intent hubs are added from the data itself.
export const FACETS = {
  roleplay: [(v) => !!v.roleplay_scenario, 'roleplay'],
  'asmr-compilation': [(v) => v.format === 'compilation', 'compilation'],
  'haircut-asmr': [scen('barber-roleplay'), 'haircut and barber roleplay'],
  'asmr-spa': [scen('spa-roleplay'), 'spa roleplay'],
  'eye-exam-asmr': [scen('eye-exam'), 'eye exam roleplay'],
  'makeup-asmr': [(v) => v.roleplay_scenario === 'makeup-artist' && /makeup|make-up/i.test(v.title), 'makeup roleplay'],
  'asmr-camping': [scen('camping'), 'camping'],
  'asmr-coffee-shop': [scen('coffee-shop'), 'coffee shop'],
  'fantasy-asmr': [scen('witch-roleplay', 'fairy-roleplay', 'elf-roleplay', 'vampire-roleplay'), 'fantasy roleplay'],
  'ear-cleaning-asmr': [(v) => String(v.modifiers).includes('ear-cleaning') || /ear clean/i.test(v.title), 'ear cleaning'],
  'mukbang-asmr': [rx(/mukbang|먹방/i), 'mukbang'],
  'medieval-asmr': [rx(/medieval|tavern|knight|kingdom/i), 'medieval'],
  'asmr-storytime': [rx(/story ?time|bedtime stor/i), 'storytime'],
  'reading-to-you': [rx(/reading (to )?you|read(ing)? you a|bedtime stor/i), 'reading aloud'],
  'asmr-rain-on-tent': [rx(/\btents?\b/i), 'rain on a tent'],
  'asmr-nature-walk': [rx(/nature walk|forest walk|\bhike\b|hiking/i), 'nature walk'],
  'cleaning-asmr': [(v) => /cleaning/i.test(v.title) && !/ear clean/i.test(v.title), 'cleaning'],
  'organizing-asmr': [rx(/organi[sz]/i), 'organizing'],
  'packing-asmr': [rx(/packing|packaging|pack (orders|with)/i), 'packing'],
  'gaming-asmr': [rx(/gaming|minecraft|fortnite|roblox|video game|controller/i), 'gaming'],
  'crafting-asmr': [rx(/\bcraft(s|ing)?\b|knit|crochet|sewing|embroider/i), 'crafting'],
  'asmr-cooking-show': [trig('cooking'), 'cooking'],
  'lofi-asmr': [(v) => String(v.modifiers).includes('lofi') || /lo-?fi/i.test(v.title), 'lofi'],
  'asmr-with-music': [(v) => /music|lo-?fi|piano/i.test(v.title) && !/no music/i.test(v.title), 'ASMR with music'],
  'anime-asmr': [rx(/anime|cosplay/i), 'anime and cosplay'],
  '10-hour-asmr': [(v) => v.duration_seconds >= 3 * 3600, '3 hours or longer'],
  'asmr-podcast': [rx(/podcast/i), 'podcast-style'],
  'asmr-in-korea': [lang('ko'), 'Korean-language'],
  'asmr-in-japan': [lang('ja'), 'Japanese-language'],
  'asmr-in-latin-america': [lang('es', 'pt'), 'Spanish and Portuguese-language'],
  'how-to-create-asmr-food-content': [trig('eating-sounds'), 'eating sounds'],
  'best-asmr-for-studying': [intent('study'), 'study'],
  'best-asmr-channels-for-sleep': [intent('sleep'), 'sleep'],
  'best-asmr-videos': [all, 'ASMR'],
  best: [all, 'ASMR'],
  'best-asmr': [all, 'ASMR'],
  'best-asmr-youtube-channels': [all, 'ASMR'],
  'best-asmr-creators': [all, 'ASMR'],
  'best-asmr-youtuber-rankings': [all, 'ASMR'],
  'asmr-artists': [all, 'ASMR'],
  'how-to-start-an-asmr-channel': [all, 'ASMR'],
  'how-to-find-your-asmr-triggers': [all, 'ASMR'],
  'asmr-statistics': [all, 'ASMR'],
};

// Food videos leak into other tags (seafood as ocean, desserts as roleplay), so non-food slices drop them.
export const FOOD = /mukbang|먹방|eating|food|noodle|candy|dessert|drinks|boba|jelly|gummy/i;
export const FOOD_OK = new Set(['eating-sounds', 'cooking', 'mukbang-asmr', 'asmr-cooking-show', 'how-to-create-asmr-food-content', 'asmr-in-korea', 'asmr-in-japan', 'asmr-in-latin-america']);

const med = (a) => { const s = a.filter((x) => x > 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
// One definition of "labelled no talking" for every page: the classifier's tag, or the creator saying so in the title
// (several spellings and languages). It is a label, not a listen.
const NO_TALK_TITLE = /no[ -]?talk|without talking|no speaking|no voice|no whisper|silent asmr|노토킹|노토크|sin hablar|sans parler|ohne sprechen|ノートーキング|声なし|喋らない/i;
export const noTalk = (v) => v.primary_trigger === 'no-talking' || /no-talking|no-voice/.test(String(v.modifiers)) || NO_TALK_TITLE.test(String(v.title));

export function buildFacts(videos, intentSlugs, creatorSlugByName) {
  const facets = { ...FACETS };
  for (const t of new Set(videos.map((v) => v.primary_trigger).filter(Boolean))) facets[t] ||= [trig(t), t.replace(/-/g, ' ')];
  const fromIntent = new Set(intentSlugs.filter((i) => !facets[i])); // a slug that is also a trigger keeps trigger rules
  for (const i of fromIntent) facets[i] = [intent(i), i.replace(/-/g, ' ')];
  const catalogMedian = Math.round(med(videos.map((v) => v.duration_seconds)) / 60);
  const facts = {};
  for (const [slug, [match, label]] of Object.entries(facets)) {
    const broad = label === 'ASMR' || fromIntent.has(slug) || FOOD_OK.has(slug);
    const a = videos.filter((v) => match(v) && (broad || !FOOD.test(v.title)));
    if (a.length < 30) continue;
    const mins = a.map((v) => (v.duration_seconds || 0) / 60);
    const pct = (n) => Math.round((100 * n) / a.length);
    // Length shares and median use only videos with a known length, so the four bars sum to ~100 and the
    // median (rounded down) never contradicts the 'Under 10 min' bar.
    const timed = mins.filter((m) => m > 0);
    const lpct = (n) => Math.round((100 * n) / Math.max(timed.length, 1));
    const ch = {};
    for (const v of a) ch[v.channel_name] = (ch[v.channel_name] || 0) + 1;
    facts[slug] = {
      label, count: a.length, medianMin: Math.floor(med(timed)), catalogMedian,
      lengths: [['Under 10 min', lpct(timed.filter((m) => m < 10).length)], ['10 to 30 min', lpct(timed.filter((m) => m >= 10 && m < 30).length)], ['30 to 60 min', lpct(timed.filter((m) => m >= 30 && m < 60).length)], ['Over an hour', lpct(timed.filter((m) => m >= 60).length)]],
      noTalking: pct(a.filter(noTalk).length),
      sleep: pct(a.filter(intent('sleep')).length),
      creators: Object.keys(ch).length,
      topCreators: Object.entries(ch).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([name, n]) => [name, n, creatorSlugByName[name] || null]),
      samples: a.slice(0, 3).map((v) => v.title.slice(0, 70)),
    };
  }
  return facts;
}
