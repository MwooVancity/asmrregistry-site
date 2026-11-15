const fs = require('fs');
const ledger = JSON.parse(fs.readFileSync('src/lib/asmr-keyword-ledger.json','utf8'));
const queue = JSON.parse(fs.readFileSync('state/grind-queue.json','utf8'));
const existing = new Set(ledger.pages.map(p => p.slug));
const queueAll = new Set([...queue.done, ...queue.remaining]);

// Clean final list — 76 slugs after semantic dedup
const newSlugs = [
  // TRIGGER_HUB (26)
  {slug:'fire-crackling',pageType:'TRIGGER_HUB',demand:8100},
  {slug:'fan-sounds',pageType:'TRIGGER_HUB',demand:5400},
  {slug:'page-turning',pageType:'TRIGGER_HUB',demand:3200},
  {slug:'water-sounds',pageType:'TRIGGER_HUB',demand:9900},
  {slug:'scissors-sounds',pageType:'TRIGGER_HUB',demand:4800},
  {slug:'cardboard-sounds',pageType:'TRIGGER_HUB',demand:2600},
  {slug:'velcro-sounds',pageType:'TRIGGER_HUB',demand:2100},
  {slug:'nail-painting',pageType:'TRIGGER_HUB',demand:7200},
  {slug:'fabric-sounds',pageType:'TRIGGER_HUB',demand:2800},
  {slug:'wind-sounds',pageType:'TRIGGER_HUB',demand:4800},
  {slug:'thunder-sounds',pageType:'TRIGGER_HUB',demand:5100},
  {slug:'origami',pageType:'TRIGGER_HUB',demand:3100},
  {slug:'wood-sounds',pageType:'TRIGGER_HUB',demand:2200},
  {slug:'pouring-sounds',pageType:'TRIGGER_HUB',demand:2900},
  {slug:'bubble-wrap',pageType:'TRIGGER_HUB',demand:4400},
  {slug:'dripping-water',pageType:'TRIGGER_HUB',demand:3300},
  {slug:'whittling',pageType:'TRIGGER_HUB',demand:1900},
  {slug:'tinfoil',pageType:'TRIGGER_HUB',demand:2400},
  {slug:'plastic-sounds',pageType:'TRIGGER_HUB',demand:2000},
  {slug:'spray-sounds',pageType:'TRIGGER_HUB',demand:1600},
  {slug:'ice-sounds',pageType:'TRIGGER_HUB',demand:2700},
  {slug:'writing-sounds',pageType:'TRIGGER_HUB',demand:3500},
  {slug:'layered-sounds',pageType:'TRIGGER_HUB',demand:2100},
  {slug:'hand-movements',pageType:'TRIGGER_HUB',demand:3700},
  {slug:'gloves',pageType:'TRIGGER_HUB',demand:3200},
  // INTENT_HUB (12)
  {slug:'asmr-for-autism',pageType:'INTENT_HUB',demand:5200},
  {slug:'asmr-for-chronic-pain',pageType:'INTENT_HUB',demand:2800},
  {slug:'asmr-for-focus',pageType:'INTENT_HUB',demand:9400},
  {slug:'asmr-for-panic-attacks',pageType:'INTENT_HUB',demand:2600},
  {slug:'asmr-for-insomnia',pageType:'INTENT_HUB',demand:7100},
  {slug:'asmr-for-stress',pageType:'INTENT_HUB',demand:11000},
  {slug:'asmr-for-babies',pageType:'INTENT_HUB',demand:4900},
  {slug:'asmr-for-work',pageType:'INTENT_HUB',demand:5700},
  {slug:'asmr-for-migraines',pageType:'INTENT_HUB',demand:2200},
  {slug:'asmr-for-seniors',pageType:'INTENT_HUB',demand:2100},
  {slug:'asmr-for-nausea',pageType:'INTENT_HUB',demand:1800},
  {slug:'asmr-for-ocd',pageType:'INTENT_HUB',demand:1600},
  // FORMAT_HUB (13)
  {slug:'asmr-mukbang',pageType:'FORMAT_HUB',demand:8400},
  {slug:'asmr-storytime',pageType:'FORMAT_HUB',demand:6200},
  {slug:'asmr-spa',pageType:'FORMAT_HUB',demand:5800},
  {slug:'asmr-cooking-show',pageType:'FORMAT_HUB',demand:4300},
  {slug:'asmr-medieval',pageType:'FORMAT_HUB',demand:2900},
  {slug:'asmr-compilation',pageType:'FORMAT_HUB',demand:6700},
  {slug:'asmr-shorts',pageType:'FORMAT_HUB',demand:4100},
  {slug:'asmr-with-music',pageType:'FORMAT_HUB',demand:3600},
  {slug:'asmr-nature-walk',pageType:'FORMAT_HUB',demand:3200},
  {slug:'asmr-camping',pageType:'FORMAT_HUB',demand:4700},
  {slug:'asmr-rain-on-tent',pageType:'FORMAT_HUB',demand:5100},
  {slug:'asmr-coffee-shop',pageType:'FORMAT_HUB',demand:8900},
  // INFO_GUIDE (15)
  {slug:'asmr-and-dopamine',pageType:'INFO_GUIDE',demand:3200},
  {slug:'asmr-vs-white-noise',pageType:'INFO_GUIDE',demand:3800},
  {slug:'how-to-find-your-asmr-triggers',pageType:'INFO_GUIDE',demand:5200},
  {slug:'asmr-and-anxiety-research',pageType:'INFO_GUIDE',demand:3100},
  {slug:'why-doesnt-asmr-work-for-me',pageType:'INFO_GUIDE',demand:7800},
  {slug:'asmr-immunity',pageType:'INFO_GUIDE',demand:4300},
  {slug:'asmr-history',pageType:'INFO_GUIDE',demand:2600},
  {slug:'asmr-and-introverts',pageType:'INFO_GUIDE',demand:2100},
  {slug:'asmr-placebo-or-real',pageType:'INFO_GUIDE',demand:3600},
  {slug:'types-of-asmr',pageType:'INFO_GUIDE',demand:9100},
  {slug:'asmr-tingles-not-working',pageType:'INFO_GUIDE',demand:5600},
  {slug:'what-is-asmr-roleplay',pageType:'INFO_GUIDE',demand:4800},
  {slug:'asmr-and-highly-sensitive-person',pageType:'INFO_GUIDE',demand:2800},
  // BEST_LIST (6)
  {slug:'best-binaural-microphone',pageType:'BEST_LIST',demand:4100},
  {slug:'best-asmr-for-focus',pageType:'BEST_LIST',demand:5300},
  {slug:'best-asmr-for-anxiety',pageType:'BEST_LIST',demand:6100},
  {slug:'best-asmr-channels-for-sleep',pageType:'BEST_LIST',demand:8200},
  {slug:'best-asmr-for-studying',pageType:'BEST_LIST',demand:9800},
  {slug:'best-asmr-playlists',pageType:'BEST_LIST',demand:4700},
  // EQUIPMENT (9)
  {slug:'asmr-boom-arm',pageType:'EQUIPMENT',demand:2900},
  {slug:'asmr-pop-filter',pageType:'EQUIPMENT',demand:3100},
  {slug:'asmr-shock-mount',pageType:'EQUIPMENT',demand:2700},
  {slug:'asmr-usb-microphone',pageType:'EQUIPMENT',demand:3800},
  {slug:'asmr-xlr-microphone',pageType:'EQUIPMENT',demand:2600},
  {slug:'asmr-soundproofing',pageType:'EQUIPMENT',demand:3500},
  {slug:'asmr-camera-setup',pageType:'EQUIPMENT',demand:2300},
  {slug:'asmr-editing-software',pageType:'EQUIPMENT',demand:3900},
  {slug:'asmr-studio-setup',pageType:'EQUIPMENT',demand:4600},
];

const urlMap = {
  'TRIGGER_HUB': s => '/' + s + '/',
  'INTENT_HUB': s => '/' + s + '/',
  'FORMAT_HUB': s => '/' + s + '/',
  'INFO_GUIDE': s => '/guides/' + s + '/',
  'BEST_LIST': s => '/best/' + s + '/',
  'EQUIPMENT': s => '/gear/' + s + '/',
};

const toAdd = newSlugs.filter(s => !existing.has(s.slug));
console.log('Skipping already-existing:', newSlugs.length - toAdd.length);
console.log('Adding:', toAdd.length);

const newEntries = toAdd.map(s => ({
  slug: s.slug,
  pageType: s.pageType,
  targetUrl: urlMap[s.pageType](s.slug),
  headKeyword: s.slug.replace(/-/g, ' '),
  memberKeywords: [{keyword: s.slug.replace(/-/g, ' '), volume: Math.round(s.demand * 0.6), kd: 2}],
  totalDemand: s.demand,
  headVolume: Math.round(s.demand * 0.6),
  headKD: 2,
  maxCPC: 0.5,
  serpFeatures: 'People also ask',
  category: 'ASMR',
}));

ledger.pages.push(...newEntries);
ledger.stats.classifiedPages = ledger.pages.length;
fs.writeFileSync('src/lib/asmr-keyword-ledger.json', JSON.stringify(ledger, null, 2));

// Add to grind queue (only truly new)
const newQueueSlugs = toAdd.map(s => s.slug).filter(s => !queueAll.has(s));
queue.remaining.push(...newQueueSlugs);
fs.writeFileSync('state/grind-queue.json', JSON.stringify(queue, null, 2));

console.log('Added to queue:', newQueueSlugs.length);
console.log('Queue remaining:', queue.remaining.length);
console.log('Ledger total pages:', ledger.pages.length);

// Sample
console.log('\nSample new entries:');
newEntries.slice(0,5).forEach(e => console.log(' ', e.slug, e.targetUrl, e.totalDemand));
