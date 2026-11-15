#!/usr/bin/env node
/**
 * subdim-sweep.mjs
 * Find slugs where stripping trailing tokens yields a parent that exists in the slug set.
 * Catches semantic subdimensions (slope/pitch/grade/etc.) missed by cannibalism-sweep.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const csv = readFileSync(resolve(ROOT, 'out/final-keywords-deduped.csv'), 'utf8');
const rows = csv.split('\n').slice(1).filter(Boolean).map(l => {
  const p = l.split(',');
  return { slug: p[0]?.trim(), title: p[1]?.trim(), keyword: p[2]?.trim(), vol: parseInt(p[3]) || 0 };
}).filter(r => r.slug);

const slugSet = new Set(rows.map(r => r.slug));

// Already debated in cannibalism-sweep (skip)
const alreadyDebated = new Set([
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

// Tokens that are NOT subdimensions — they change the page meaningfully
// (brand tokens, cost/price/calculator are structural, not content modifiers)
const STRUCTURAL_SUFFIXES = new Set(['calculator','calc','cost','price','prices','estimate','estimator','calculator']);

const candidates = [];

for (const { slug, vol } of rows) {
  if (alreadyDebated.has(slug)) continue;

  const parts = slug.split('-');
  if (parts.length < 3) continue;

  // Strip tokens from the right, skip structural suffixes, check if remaining exists in slugSet
  // Also strip -calculator suffix first for clean comparison
  const base = slug.replace(/-calculator$/, '').replace(/-calc$/, '').replace(/-cost$/, '').replace(/-price$/, '').replace(/-estimator$/, '');
  const baseParts = base.split('-');

  // Try removing 1 to (n-1) tokens from the right of baseParts
  for (let strip = 1; strip < baseParts.length; strip++) {
    const parent = baseParts.slice(0, baseParts.length - strip).join('-');
    if (parent.length < 3) break;

    // Check parent as-is, with -calculator, with -cost
    const candidates_to_check = [
      parent,
      parent + '-calculator',
      parent + '-cost',
      parent + '-price',
    ];

    for (const candidate of candidates_to_check) {
      if (slugSet.has(candidate) && candidate !== slug) {
        const strippedTokens = baseParts.slice(baseParts.length - strip).join('-');
        // Skip if stripped token is purely structural
        if (!STRUCTURAL_SUFFIXES.has(strippedTokens)) {
          candidates.push({
            child: slug,
            parent: candidate,
            strippedTokens,
            childVol: vol,
            parentVol: rows.find(r => r.slug === candidate)?.vol || 0,
            strip,
          });
        }
        break; // found a parent for this strip level, don't need deeper
      }
    }
    if (candidates.find(c => c.child === slug && c.strip === strip)) break; // found one, stop
  }
}

// Dedup: one entry per child slug (shortest strip = closest parent)
const seen = new Set();
const deduped = candidates.filter(c => {
  if (seen.has(c.child)) return false;
  seen.add(c.child);
  return true;
});

deduped.sort((a, b) => (b.childVol + b.parentVol) - (a.childVol + a.parentVol));

console.log(`\n=== SUBDIMENSION SWEEP RESULTS ===`);
console.log(`Total slugs: ${rows.length} | Candidates: ${deduped.length}\n`);
console.log(`child_vol\tparent_vol\tstripped\tchild\tparent`);
for (const c of deduped) {
  console.log(`${c.childVol}\t${c.parentVol}\t${c.strippedTokens}\t${c.child}\t${c.parent}`);
}
