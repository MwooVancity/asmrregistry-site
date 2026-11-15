/**
 * Remove quota-padding crosslinks.
 * Rule: "would the user actually click it next?"
 *
 * Approach: for each page, classify its topic cluster,
 * then remove crosslinks to targets that don't fit.
 *
 * Run: node tools/remove-quota-crosslinks.mjs [--dry-run]
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const DRY = process.argv.includes('--dry-run');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'src/lib/asmr-page-content.json');
const data = JSON.parse(readFileSync(file, 'utf8'));

// ── Topic clusters by slug keyword matching ──────────────────────────────────
// Returns a set of tags for the source page
function tags(slug) {
  const t = new Set();
  if (/sleep|insomnia|bedtime|sleep-stories|lullaby/.test(slug)) t.add('sleep');
  if (/anxiety|stress|panic|ocd|ptsd|chronic-pain|depression|adhd/.test(slug)) t.add('anxiety');
  if (/focus|study|concentration|productivity/.test(slug)) t.add('focus');
  if (/meditat|relax|calm|spa|zen/.test(slug)) t.add('relax');
  if (/microphone|mic\b|xlr|usb.*mic|mic.*usb|boom.*arm|pop.*filter|shock.*mount|soundproof|studio|recording|camera|editing|equipment|gear/.test(slug)) t.add('gear');
  if (/creator|channel|how.*make|how.*start|youtuber|streaming/.test(slug)) t.add('creator');
  if (/binaural|headphone|earphone|earbud|3d.audio|audio/.test(slug)) t.add('audio');
  if (/white.*noise|brown.*noise|pink.*noise|noise/.test(slug)) t.add('noise');
  if (/nature|rain|ocean|wind|forest|outdoor|camping|ambient/.test(slug)) t.add('nature');
  if (/tapping|typing|scratching|knocking|glass|slime|soap|sand|cooking|eating|mouth|crunching|paper/.test(slug)) t.add('trigger-physical');
  if (/whispering|soft.*speak|speak.*soft|role.*play|roleplay|personal.*attention|haircut|doctor|spa|massage/.test(slug)) t.add('trigger-voice');
  if (/lofi|lo.fi|music|playlist|podcast/.test(slug)) t.add('audio-format');
  if (/kids|child|baby|toddler/.test(slug)) t.add('kids');
  if (/misophon|frisson|tingle|why.*work|science|brain|how.*asmr|affect|research/.test(slug)) t.add('science');
  if (/what.*is|what.*does|meaning|stand.*for|definition|significad|slang|explain/.test(slug)) t.add('definition');
  if (/best.*asmr|asmr.*best/.test(slug)) t.add('best');
  if (/vr|game|interactive/.test(slug)) t.add('format');
  if (/highly.*sensitive|introvert|empath|sensitive.*person/.test(slug)) t.add('personality');
  return t;
}

// ── Removal rules ─────────────────────────────────────────────────────────────
// For each target href, define which source tag combinations should NOT link there.
// "remove if source has NONE of these tags" = irrelevant to this target
const removalRules = {
  '/binaural/': {
    // Only relevant if: sleep, audio, relax, science, gear, or noise topics
    keepIf: new Set(['sleep','audio','relax','science','gear','noise','focus','anxiety']),
    // Remove if source is: gear-creator, kids, or pure trigger page with no sleep/relax context
    removeIf: new Set(['creator','definition','kids','trigger-physical']),
    // Special: remove from trigger-physical pages UNLESS they also have sleep/relax
    specialRemoveUnless: { has: 'trigger-physical', unless: new Set(['sleep','relax','anxiety','focus']) }
  },
  '/no-talking/': {
    // Relevant when reader needs non-voice ASMR: sleep, focus, anxiety, noise, nature
    keepIf: new Set(['sleep','focus','anxiety','noise','nature','relax']),
    removeIf: new Set(['creator','gear','definition','trigger-physical','trigger-voice','audio','science','format','personality']),
  },
  '/whispering/': {
    // Relevant when reader exploring voice ASMR or intimate content
    keepIf: new Set(['trigger-voice','relax','anxiety','sleep','best','personality']),
    removeIf: new Set(['creator','gear','noise','definition','trigger-physical','audio','format','nature','focus','science']),
  },
  '/tapping/': {
    // Relevant when reader exploring trigger types; NOT for sleep/anxiety (tapping is stimulating)
    keepIf: new Set(['trigger-physical','science','best','format']),
    removeIf: new Set(['sleep','anxiety','creator','gear','definition','noise','nature','trigger-voice','audio','relax','focus','kids','personality']),
  },
  '/personal-attention/': {
    // Relevant for relax, spa, anxiety, intimate ASMR context
    keepIf: new Set(['trigger-voice','relax','anxiety','sleep','best','personality']),
    removeIf: new Set(['creator','gear','noise','definition','trigger-physical','audio','format','nature','focus','science','kids']),
  },
  '/soft-speaking/': {
    // Similar to whispering — voice-ASMR context
    keepIf: new Set(['trigger-voice','relax','anxiety','sleep','best','personality']),
    removeIf: new Set(['creator','gear','noise','definition','trigger-physical','audio','format','nature','focus','science','kids']),
  },
};

// ── Apply rules ───────────────────────────────────────────────────────────────
let totalRemoved = 0;
const removedByTarget = {};
const removedLog = [];

const slugs = Object.keys(data).filter(s => data[s].status === 'published');

for (const slug of slugs) {
  const page = data[slug];
  if (!page.crossLinks) continue;
  const sourceTags = tags(slug);

  const kept = [];
  for (const link of page.crossLinks) {
    const rule = removalRules[link.href];
    if (!rule) { kept.push(link); continue; }

    // Determine if we should remove this link
    let remove = false;

    // Check removeIf: if source has ANY removeIf tag AND no keepIf tags
    const hasKeepTag = [...rule.keepIf].some(t => sourceTags.has(t));
    const hasRemoveTag = [...rule.removeIf].some(t => sourceTags.has(t));

    if (hasRemoveTag && !hasKeepTag) {
      remove = true;
    }

    // Special rule for binaural: remove from trigger-physical pages unless they also have sleep/relax/etc.
    if (link.href === '/binaural/' && rule.specialRemoveUnless) {
      const r = rule.specialRemoveUnless;
      if (sourceTags.has(r.has) && ![...r.unless].some(t => sourceTags.has(t))) {
        remove = true;
      }
    }

    if (remove) {
      totalRemoved++;
      removedByTarget[link.href] = (removedByTarget[link.href] || 0) + 1;
      removedLog.push({ slug, href: link.href, label: link.label, sourceTags: [...sourceTags] });
    } else {
      kept.push(link);
    }
  }
  if (!DRY) page.crossLinks = kept;
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log('\nREMOVAL SUMMARY' + (DRY ? ' [DRY RUN]' : ''));
console.log('Total removed:', totalRemoved);
Object.entries(removedByTarget).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>
  console.log('  ' + v + 'x ' + k)
);

console.log('\nSAMPLE REMOVALS (first 20):');
removedLog.slice(0,20).forEach(r =>
  console.log('  ' + r.slug + ' → ' + r.href + ' [tags: ' + r.sourceTags.join(',') + ']')
);

// Verify no page drops below 0 crosslinks and check remaining counts
if (!DRY) {
  console.log('\nREMAINING INBOUND COUNTS:');
  const inbound = {};
  slugs.forEach(s => {
    (data[s].crossLinks||[]).forEach(l => {
      const k = l.href.replace(/\//g,'');
      inbound[k] = (inbound[k]||0)+1;
    });
  });
  Object.entries(inbound).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([k,v])=>
    console.log('  ' + v + 'x ' + k)
  );
  const total = Object.values(inbound).reduce((a,b)=>a+b,0);
  console.log('  Total crosslinks remaining:', total);
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log('\nWritten to', file);
}
