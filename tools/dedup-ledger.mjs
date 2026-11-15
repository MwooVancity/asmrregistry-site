import { readFileSync, writeFileSync } from 'fs';

const ledger = JSON.parse(readFileSync('src/lib/asmr-keyword-ledger.json', 'utf8'));
const content = JSON.parse(readFileSync('src/lib/asmr-page-content.json', 'utf8'));

// === DEDUP MAP ===
// Each entry: slug → { action: 'merge'|'prune', target?: canonical slug, reason: string }

const dedup = {
  // MERGE → whats-asmr (already published, 1,210/mo)
  'what-does-asmr-stand-for-on-instagram': { action: 'merge', target: 'whats-asmr', reason: 'same as "what does ASMR stand for"' },
  'what-does-asmr-stand-for-in-social-media': { action: 'merge', target: 'whats-asmr', reason: 'same query' },
  'asmr-meaning-text': { action: 'merge', target: 'whats-asmr', reason: 'ASMR meaning = whats-asmr' },
  'asmr-meaning-definition': { action: 'merge', target: 'whats-asmr', reason: 'ASMR meaning = whats-asmr' },
  'what-does-asmr-stand-for-in-text': { action: 'merge', target: 'whats-asmr', reason: 'same query' },
  'asmr-acronym-meaning': { action: 'merge', target: 'whats-asmr', reason: 'ASMR acronym = whats-asmr' },
  'does-asmr-stand-for': { action: 'merge', target: 'whats-asmr', reason: 'incomplete query = whats-asmr' },
  'what-does-asmr-stabd-for': { action: 'merge', target: 'whats-asmr', reason: 'typo of same query' },
  'what-does-asmr-stand': { action: 'merge', target: 'whats-asmr', reason: 'incomplete query' },
  'what-is-asmr-slang': { action: 'merge', target: 'whats-asmr', reason: 'answered in whats-asmr FAQ' },
  'what-does-asmr-mean-on-social-media': { action: 'merge', target: 'whats-asmr', reason: 'same query' },
  'what-is-asmr-in-social-media': { action: 'merge', target: 'whats-asmr', reason: 'same query' },

  // MERGE → is-asmr-good-for-you (already published, 300/mo)
  'is-asmr-bad-for-you': { action: 'merge', target: 'is-asmr-good-for-you', reason: 'inverse of same question' },
  'does-asmr-lower-cortisol': { action: 'merge', target: 'is-asmr-good-for-you', reason: 'answered in benefits section' },
  'why-does-asmr-make-me-tingle': { action: 'merge', target: 'is-asmr-good-for-you', reason: 'science question covered' },
  'why-do-i-get-tingles-from-asmr': { action: 'merge', target: 'is-asmr-good-for-you', reason: 'same as tingle question' },
  'why-does-asmr-feel-so-good': { action: 'merge', target: 'is-asmr-good-for-you', reason: 'same science question' },

  // MERGE → best-asmr-for-sleep (already published, 300/mo)
  'does-asmr-help-you-sleep': { action: 'merge', target: 'best-asmr-for-sleep', reason: 'directly answered in FAQ' },
  'does-asmr-help-with-sleep': { action: 'merge', target: 'best-asmr-for-sleep', reason: 'same query' },

  // MERGE → how-to-make-asmr-videos (already published, 300/mo)
  'how-to-make-asmr': { action: 'merge', target: 'how-to-make-asmr-videos', reason: 'shorter version of same' },
  'how-to-make-an-asmr-video': { action: 'merge', target: 'how-to-make-asmr-videos', reason: 'singular of same' },
  'how-to-do-asmr-videos': { action: 'merge', target: 'how-to-make-asmr-videos', reason: 'same intent' },
  'how-to-make-asmr-videos-with-phone': { action: 'merge', target: 'how-to-make-asmr-videos', reason: 'subsection of same guide' },

  // MERGE → best-asmr-videos (already published, 600/mo)
  'best-asmr-video': { action: 'merge', target: 'best-asmr-videos', reason: 'singular of same' },
  'most-popular-asmr-video': { action: 'merge', target: 'best-asmr-videos', reason: 'same intent' },
  'most-popular-asmr': { action: 'merge', target: 'best-asmr-videos', reason: 'same intent' },
  'top-asmr': { action: 'merge', target: 'best-asmr-videos', reason: 'same intent' },

  // MERGE → existing hub pages (massage, eating-sounds, slime)
  'asmr-massage-meaning': { action: 'merge', target: 'massage', reason: 'meaning query → hub page' },
  'what-is-an-asmr-massage': { action: 'merge', target: 'massage', reason: 'meaning query → hub page' },
  'what-is-a-asmr-massage': { action: 'merge', target: 'massage', reason: 'meaning query → hub page' },
  'asmr-eating-meaning': { action: 'merge', target: 'eating-sounds', reason: 'meaning query → hub page' },
  'what-is-asmr-eating': { action: 'merge', target: 'eating-sounds', reason: 'meaning query → hub page' },
  'asmr-food-meaning': { action: 'merge', target: 'eating-sounds', reason: 'meaning query → hub page' },
  'asmr-cooking-meaning': { action: 'merge', target: 'eating-sounds', reason: 'meaning query → hub page' },
  'asmr-meaning-food': { action: 'merge', target: 'eating-sounds', reason: 'meaning query → hub page' },
  'what-does-asmr-stand-for-food': { action: 'merge', target: 'eating-sounds', reason: 'food context → eating hub' },
  'what-is-slime-asmr': { action: 'merge', target: 'slime', reason: 'meaning query → hub page' },

  // MERGE duplicates within BEST_LIST clusters

  // → best-asmr-youtube-channels (canonical channels page)
  'best-asmr-channels': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'same as channels list' },
  'best-asmr-channels-on-youtube': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'same' },
  'most-popular-asmr-artists': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'same intent' },
  'best-asmr-artists': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'same intent' },
  'top-asmr-artists': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'same intent' },
  'top-asmr-youtubers': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'same intent' },
  'top-asmr-youtube-channels': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'same' },
  'top-asmr-youtube-channels-2025': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'dated variant' },
  'best-asmr-youtube-channels-2025': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'dated variant' },
  'best-asmr-youtube-channels-2026': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'dated variant' },
  'best-asmr-channels-youtube': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'word order variant' },
  'top-asmr-channels': { action: 'merge', target: 'best-asmr-youtube-channels', reason: 'same intent' },

  // → best-microphone-for-asmr (canonical mic page)
  'best-mic-for-asmr': { action: 'merge', target: 'best-microphone-for-asmr', reason: 'abbreviation of same' },
  'best-asmr-mic': { action: 'merge', target: 'best-microphone-for-asmr', reason: 'word order variant' },
  'best-mics-for-asmr': { action: 'merge', target: 'best-microphone-for-asmr', reason: 'plural variant' },
  'best-microphones-for-asmr': { action: 'merge', target: 'best-microphone-for-asmr', reason: 'plural variant' },

  // → best-earbuds-for-asmr (canonical headphones page)
  'best-asmr-headphones': { action: 'merge', target: 'best-earbuds-for-asmr', reason: 'headphones = earbuds page' },
  'best-bluetooth-headphones-for-asmr': { action: 'merge', target: 'best-earbuds-for-asmr', reason: 'headphone subtype' },
  'best-asmr-headphones-for-iphone': { action: 'merge', target: 'best-earbuds-for-asmr', reason: 'headphone subtype' },
  'best-brand-for-asmr-headphones': { action: 'merge', target: 'best-earbuds-for-asmr', reason: 'headphone variant' },
  'best-wired-headphones-for-asmr': { action: 'merge', target: 'best-earbuds-for-asmr', reason: 'headphone subtype' },
  'best-over-ear-headphones-for-asmr': { action: 'merge', target: 'best-earbuds-for-asmr', reason: 'headphone subtype' },

  // → asmr-equipment (canonical equipment overview)
  'microphone-for-asmr': { action: 'merge', target: 'asmr-equipment', reason: 'equipment subtype' },
  'asmr-kit': { action: 'merge', target: 'asmr-equipment', reason: 'kit = equipment' },
  'asmr-ear-microphone': { action: 'merge', target: 'asmr-equipment', reason: 'equipment subtype' },
  'microphone-asmr': { action: 'merge', target: 'asmr-equipment', reason: 'word order variant' },
  'asmr-setup': { action: 'merge', target: 'asmr-equipment', reason: 'setup = equipment' },
  'ear-microphone-asmr': { action: 'merge', target: 'asmr-equipment', reason: 'equipment subtype' },
  'asmr-microphone-setup': { action: 'merge', target: 'asmr-equipment', reason: 'equipment variant' },
  'asmr-head-microphone': { action: 'merge', target: 'asmr-equipment', reason: 'equipment subtype' },
  'headphone-asmr': { action: 'merge', target: 'asmr-equipment', reason: 'equipment subtype' },
  'asmr-microphone-with-ears': { action: 'merge', target: 'asmr-equipment', reason: 'equipment subtype' },
  'asmr-equipment-for-beginners': { action: 'merge', target: 'asmr-equipment', reason: 'subset of equipment' },

  // MERGE within how-to-start cluster
  'how-to-start-a-asmr-youtube-channel': { action: 'merge', target: 'how-to-start-an-asmr-channel', reason: 'same query' },

  // MERGE AI ASMR variants
  'how-to-make-ai-asmr': { action: 'merge', target: 'how-to-make-ai-asmr-videos', reason: 'shorter variant' },
  'how-to-make-asmr-ai-videos': { action: 'merge', target: 'how-to-make-ai-asmr-videos', reason: 'word order variant' },

  // MERGE mommy variant
  'asmr-mom-meaning': { action: 'merge', target: 'what-is-mommy-asmr', reason: 'same topic' },

  // PRUNE: Spanish (English-only site)
  'asmr-que-es': { action: 'prune', reason: 'Spanish query, English-only site' },
  'que-es-asmr-en-espaol': { action: 'prune', reason: 'Spanish query' },
  'que-es-el-asmr': { action: 'prune', reason: 'Spanish query' },
  'que-es-asmr-significado': { action: 'prune', reason: 'Spanish query' },

  // PRUNE: unwinnable / brand risk / thin
  'what-does-jane-asmr-look-like': { action: 'prune', reason: 'personal query about specific creator' },
  'why-does-asmr-make-me-horny': { action: 'prune', reason: 'brand risk' },
  'is-asmr-demonic': { action: 'prune', reason: 'religious query, not our domain' },
  'is-asmr-a-sin': { action: 'prune', reason: 'religious query, not our domain' },
  'best-asmr-websites': { action: 'prune', reason: 'self-referential, 50/mo too thin' },
};

// === EXECUTE ===
let mergedCount = 0;
let prunedCount = 0;
let absorbedDemand = 0;
const buildSlugs = new Set();

for (const [slug, action] of Object.entries(dedup)) {
  const pageIdx = ledger.pages.findIndex(p => p.slug === slug);
  if (pageIdx === -1) {
    console.log(`  SKIP: ${slug} not found in ledger`);
    continue;
  }
  const page = ledger.pages[pageIdx];

  if (action.action === 'merge') {
    const targetIdx = ledger.pages.findIndex(p => p.slug === action.target);
    if (targetIdx === -1) {
      console.log(`  WARN: target ${action.target} not in ledger, creating placeholder`);
    } else {
      // Add head keyword + member keywords to target
      const target = ledger.pages[targetIdx];
      const headMk = { keyword: page.headKeyword, volume: page.headVolume, kd: page.headKD };
      const allKws = [headMk, ...page.memberKeywords];
      for (const mk of allKws) {
        if (!target.memberKeywords.find(m => m.keyword === mk.keyword)) {
          target.memberKeywords.push(mk);
          target.totalDemand += mk.volume;
        }
      }
    }
    // Remove merged page
    ledger.pages.splice(pageIdx, 1);
    // Remove content entry if exists
    if (content[slug]) delete content[slug];
    absorbedDemand += page.totalDemand;
    mergedCount++;
  } else if (action.action === 'prune') {
    ledger.pages.splice(pageIdx, 1);
    if (content[slug]) delete content[slug];
    absorbedDemand += page.totalDemand;
    prunedCount++;
  }
}

// Identify remaining unpublished pages (these are the BUILD list)
const remaining = ledger.pages.filter(p => {
  if (p.pageType === 'CREATOR_NAV') return false;
  const c = content[p.slug];
  return !(c && c.status === 'published' && c.introHtml && c.introHtml.length > 500);
});

console.log('\n=== DEDUP RESULTS ===');
console.log(`Merged: ${mergedCount} pages into canonical targets`);
console.log(`Pruned: ${prunedCount} pages (unwinnable/brand risk/Spanish)`);
console.log(`Absorbed demand redirected to canonical pages: ${absorbedDemand.toLocaleString()}/mo`);
console.log(`Ledger pages remaining: ${ledger.pages.length}`);
console.log(`Content entries remaining: ${Object.keys(content).length}`);
console.log(`\nPages still to BUILD: ${remaining.length}`);

remaining.sort((a, b) => b.totalDemand - a.totalDemand);
remaining.forEach(p => {
  const money = p.totalDemand * Math.max(p.maxCPC, 0.10);
  console.log(`  ${p.slug.padEnd(50)} ${p.totalDemand.toString().padStart(6)}/mo  KD ${p.headKD.toString().padStart(2)}  $${p.maxCPC.toFixed(2).padStart(5)}  money=${Math.round(money).toString().padStart(4)}  [${p.pageType}]`);
});

console.log(`\nTotal remaining demand: ${remaining.reduce((s, p) => s + p.totalDemand, 0).toLocaleString()}/mo`);

// Update stats
ledger.stats = {
  ...ledger.stats,
  totalPages: ledger.pages.length,
  dedupRun: '2026-06-20',
  mergedCount,
  prunedCount,
};

writeFileSync('src/lib/asmr-keyword-ledger.json', JSON.stringify(ledger, null, 2));
writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(content, null, 2));
console.log('\nLedger and content JSON updated.');
