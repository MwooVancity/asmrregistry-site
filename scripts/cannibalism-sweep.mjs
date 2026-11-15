#!/usr/bin/env node
/**
 * cannibalism-sweep.mjs — Apply all learned kill rules to entire CSV
 * Rules: brand modifiers, retailer variants, attribute-only suffixes, synonym duplicates
 * Output: candidates grouped by reason, ordered by confidence
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const csv = readFileSync(resolve(ROOT, 'out/final-keywords-deduped.csv'), 'utf8');
const rows = csv.split('\n').slice(1).filter(Boolean).map(l => {
  const p = l.split(',');
  return { slug: p[0]?.trim(), title: p[1]?.trim(), keyword: p[2]?.trim(), vol: parseInt(p[3])||0, hub: p[5]?.trim(), niche: p[6]?.trim() };
}).filter(r => r.slug);

const slugSet = new Set(rows.map(r => r.slug));

// Already confirmed kills (batches 1+2+3, not yet removed from CSV but debated)
const alreadyDebated = new Set([
  // batch 3 (55 slugs, confirmed, not yet executed)
  'concrete-volume-calculator','cost-of-concrete-per-yard-delivered','concrete-delivery-price',
  'concrete-slab-thickness','concrete-step-resurfacing','resurface-driveway','deck-builder',
  'build-deck','deck-wood','wooden-deck','deck-lumber','deck-boards','lowes-deck','menards-deck',
  'metal-roof-panels','metal-roof-color','roof-square','roof-installation','hardwood-floor',
  'hardwood-flooring-cost','refinish-hardwood-floors','laminate-wood-flooring','laminate-flooring-cost',
  'laminate-installation','lvp-flooring-installation','luxury-vinyl-flooring-installation',
  'vinyl-plank-flooring-cost','gutter-material','pool-water','pool-gallons','pool-size',
  'solar-power','solar-electric','battery-storage','septic','gpm','andersen-windows','pella-window',
  'aluminum-gutter','copper-gutter','vinyl-gutters','ceramic-tile','porcelain-tile','tile-floor',
  'wall-insulation','home-insulation','rolled-insulation','ceiling-insulation','k-style','leaf-guard',
  'concrete-garage-floor','heated-concrete-floor','polished-concrete-floor',
  'pressure-treated-wood-deck','cedar-deck',
]);

// Brand / retailer patterns (KILLS: brand modifier doesn't change formula)
const BRAND_TOKENS = [
  'quikrete','sakrete','home-depot','lowes','lowe','menards','trex','timbertech','azek',
  'andersen','pella','sherwin','behr','james-hardie','owens-corning','certainteed',
  'gaf','atlas-roofing','tamko','drylok','rustoleum','rust-oleum','hardie','dunn-edwards',
  'valspar','benjamin-moore','kilz','glidden','zinsser','loctite','gorilla',
  'dewalt','ryobi','husqvarna','stihl','john-deere','kubota','generac',
  'briggs','honda-generator','champion','firman','duromax','westinghouse',
  'rainbird','hunter-irrigation','kohler','lg-','samsung-','carrier-','lennox-',
  'trane-','rheem-','bradford-white','ao-smith','mitsubishi-','daikin-','mini-split-',
  'americraft','leaf-filter','leafguard','gutter-helmet',
];

// Pure attribute suffixes — appending to a parent that already exists in CSV
const ATTRIBUTE_SUFFIXES = [
  'gray','grey','white','black','brown','red','blue','green',
  'small','large','medium','big','cheap','best','free','diy',
  'near-me','online',
];

// Question-format prefixes that collapse into parent calc
const QUESTION_PREFIXES = ['how-many','how-much','how-big','how-long','how-wide',
  'how-thick','how-deep','what-is','what-does','does-a'];

// Per-unit fragments that don't add distinct calc
const PER_UNIT_FRAGMENTS = ['-per-square-foot','-per-square-yard','-per-linear-foot',
  '-per-gallon','-per-bag','-per-unit','-per-ton'];

// Generic synonym suffixes — when parent calc already exists
const GENERIC_LABELS = [
  // e.g. "asphalt-paving" vs "asphalt-paving-cost" — the bare noun is the synonym
];

const candidates = [];

function flag(slug, reason, confidence, note='') {
  if (alreadyDebated.has(slug)) return;
  candidates.push({ slug, vol: rows.find(r=>r.slug===slug)?.vol||0, reason, confidence, note });
}

for (const { slug, vol, niche, hub } of rows) {
  if (alreadyDebated.has(slug)) continue;

  // 1. Brand modifier
  const brandHit = BRAND_TOKENS.find(b => slug.includes(b));
  if (brandHit) {
    flag(slug, 'brand-modifier', 'HIGH', `contains "${brandHit}"`);
    continue;
  }

  // 2. Question format
  const questionHit = QUESTION_PREFIXES.find(q => slug.startsWith(q + '-'));
  if (questionHit) {
    flag(slug, 'question-format', 'HIGH', `starts with "${questionHit}-"`);
    continue;
  }

  // 3. Per-unit fragment
  const perUnitHit = PER_UNIT_FRAGMENTS.find(f => slug.endsWith(f));
  if (perUnitHit) {
    // Only kill if parent base exists in slug set
    const base = slug.replace(perUnitHit, '');
    if (slugSet.has(base) || slugSet.has(base + '-calculator') || slugSet.has(base + '-cost')) {
      flag(slug, 'per-unit-of-parent', 'HIGH', `parent: "${base}"`);
      continue;
    }
    // else: might be standalone — flag as medium
    flag(slug, 'per-unit-check', 'MEDIUM', `no confirmed parent, check manually`);
    continue;
  }

  // 4. Attribute suffix — removing last token gives parent in CSV
  const parts = slug.split('-');
  if (parts.length >= 3) {
    const lastToken = parts[parts.length - 1];
    const withoutLast = parts.slice(0, -1).join('-');
    if (ATTRIBUTE_SUFFIXES.includes(lastToken) && slugSet.has(withoutLast)) {
      flag(slug, `color/attr-suffix (parent: ${withoutLast})`, 'HIGH', `last token "${lastToken}" is attribute`);
      continue;
    }
    // Also check second-to-last token removal
    const lastTwo = parts.slice(-2).join('-');
    const withoutLastTwo = parts.slice(0, -2).join('-');
    if (ATTRIBUTE_SUFFIXES.some(a => lastTwo.startsWith(a) || lastTwo.endsWith(a)) && slugSet.has(withoutLastTwo)) {
      flag(slug, `attr-variant (parent: ${withoutLastTwo})`, 'MEDIUM', `last two tokens look like attribute variant`);
      continue;
    }
  }

  // 5. Duplicate phrasings — slug is strict subset/synonym of another slug in same niche
  // Check if slug without trailing noun is identical to another slug
  const withoutCost = slug.replace(/-cost$/, '').replace(/-price$/, '').replace(/-prices$/, '').replace(/-estimate$/, '').replace(/-estimator$/, '');
  const withoutCalc = slug.replace(/-calculator$/, '').replace(/-calc$/, '');
  if (withoutCost !== slug) {
    if (slugSet.has(withoutCost + '-cost') && slugSet.has(withoutCost + '-calculator')) {
      flag(slug, 'cost+calc both exist', 'LOW', `both "${withoutCost}-cost" and "${withoutCost}-calculator" in CSV`);
    }
  }
}

// Sort: HIGH confidence first, then by volume desc
const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
candidates.sort((a, b) => (order[a.confidence] - order[b.confidence]) || b.vol - a.vol);

const high = candidates.filter(c => c.confidence === 'HIGH');
const medium = candidates.filter(c => c.confidence === 'MEDIUM');
const low = candidates.filter(c => c.confidence === 'LOW');

console.log(`\n=== CANNIBALISM SWEEP RESULTS ===`);
console.log(`Total remaining CSV slugs: ${rows.length}`);
console.log(`Already debated (not counted): ${alreadyDebated.size}`);
console.log(`New candidates: ${candidates.length} (HIGH: ${high.length}, MEDIUM: ${medium.length}, LOW: ${low.length})\n`);

console.log(`--- HIGH CONFIDENCE (${high.length}) ---`);
for (const c of high) {
  console.log(`${c.vol}\t${c.slug}\t[${c.reason}]\t${c.note}`);
}

console.log(`\n--- MEDIUM CONFIDENCE (${medium.length}) ---`);
for (const c of medium) {
  console.log(`${c.vol}\t${c.slug}\t[${c.reason}]\t${c.note}`);
}

console.log(`\n--- LOW CONFIDENCE (${low.length}) ---`);
for (const c of low) {
  console.log(`${c.vol}\t${c.slug}\t[${c.reason}]\t${c.note}`);
}

// Group by reason
console.log('\n--- BY REASON ---');
const byReason = {};
for (const c of candidates) {
  const key = c.reason.split(' ')[0].split('(')[0].trim();
  if (!byReason[key]) byReason[key] = [];
  byReason[key].push(c.slug);
}
for (const [r, slugs] of Object.entries(byReason)) {
  console.log(`${r}: ${slugs.length} → ${slugs.slice(0,5).join(', ')}${slugs.length>5?' …':''}`);
}
