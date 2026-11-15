#!/usr/bin/env node
/**
 * kill-subdim-children.mjs
 * Remove all 215 subdimension child slugs from final-keywords-deduped.csv and build-queue.csv
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Re-run subdim sweep inline to get kill list
const csv = readFileSync(resolve(ROOT, 'out/final-keywords-deduped.csv'), 'utf8');
const rows = csv.split('\n').slice(1).filter(Boolean).map(l => {
  const p = l.split(',');
  return { slug: p[0]?.trim(), title: p[1]?.trim(), keyword: p[2]?.trim(), vol: parseInt(p[3]) || 0, rest: p.slice(3).join(',') };
}).filter(r => r.slug);

const slugSet = new Set(rows.map(r => r.slug));
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

const STRUCTURAL_SUFFIXES = new Set(['calculator','calc','cost','price','prices','estimate','estimator']);

const toKill = new Set();

for (const { slug, vol } of rows) {
  if (alreadyDebated.has(slug)) continue;
  const parts = slug.split('-');
  if (parts.length < 3) continue;
  const base = slug.replace(/-calculator$/, '').replace(/-calc$/, '').replace(/-cost$/, '').replace(/-price$/, '').replace(/-estimator$/, '');
  const baseParts = base.split('-');
  for (let strip = 1; strip < baseParts.length; strip++) {
    const parent = baseParts.slice(0, baseParts.length - strip).join('-');
    if (parent.length < 3) break;
    const checks = [parent, parent + '-calculator', parent + '-cost', parent + '-price'];
    let found = false;
    for (const c of checks) {
      if (slugSet.has(c) && c !== slug) {
        const stripped = baseParts.slice(baseParts.length - strip).join('-');
        if (!STRUCTURAL_SUFFIXES.has(stripped)) {
          toKill.add(slug);
          found = true;
        }
        break;
      }
    }
    if (found) break;
  }
}

console.log(`Killing ${toKill.size} slugs`);

// Remove from final-keywords-deduped.csv
const header = csv.split('\n')[0];
const kept = rows.filter(r => !toKill.has(r.slug));
const killed = rows.filter(r => toKill.has(r.slug));
const newCsv = [header, ...kept.map(r => `${r.slug},${r.title},${r.keyword},${r.rest}`)].join('\n');
writeFileSync(resolve(ROOT, 'out/final-keywords-deduped.csv'), newCsv);
console.log(`final-keywords-deduped.csv: ${rows.length} → ${kept.length} rows`);

// Remove from build-queue.csv
const bqRaw = readFileSync(resolve(ROOT, 'out/build-queue.csv'), 'utf8');
const bqLines = bqRaw.split('\n');
const bqHeader = bqLines[0];
const slugIdx = bqHeader.split(',').indexOf('slug');
const bqKept = bqLines.slice(1).filter(l => {
  if (!l.trim()) return false;
  const s = l.split(',')[slugIdx]?.trim();
  return !toKill.has(s);
});
writeFileSync(resolve(ROOT, 'out/build-queue.csv'), [bqHeader, ...bqKept].join('\n'));
console.log(`build-queue.csv: ${bqLines.length - 1} → ${bqKept.length} rows`);

// Also update build-queue-with-kp-vol.csv if it exists
try {
  const bkvRaw = readFileSync(resolve(ROOT, 'out/build-queue-with-kp-vol.csv'), 'utf8');
  const bkvLines = bkvRaw.split('\n');
  const bkvHeader = bkvLines[0];
  const bkvSlugIdx = bkvHeader.split(',').indexOf('slug');
  const bkvKept = bkvLines.slice(1).filter(l => {
    if (!l.trim()) return false;
    const s = l.split(',')[bkvSlugIdx]?.trim();
    return !toKill.has(s);
  });
  writeFileSync(resolve(ROOT, 'out/build-queue-with-kp-vol.csv'), [bkvHeader, ...bkvKept].join('\n'));
  console.log(`build-queue-with-kp-vol.csv: ${bkvLines.length - 1} → ${bkvKept.length} rows`);
} catch {}

// Write kill receipt
writeFileSync(resolve(ROOT, 'out/subdim-killed.txt'), [...toKill].sort().join('\n'));
console.log(`Receipt: out/subdim-killed.txt`);

// Sample killed
console.log(`\nSample killed (first 20):`);
for (const r of killed.slice(0, 20)) {
  console.log(`  ${r.vol}\t${r.slug}`);
}
