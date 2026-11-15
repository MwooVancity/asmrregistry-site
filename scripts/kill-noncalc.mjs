#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const KILL = new Set([
  'bags','valves','satin','dehumidifiers','dishwashers','electric-stoves','induction-stoves',
  'soldering-iron','swamp-coolers',
  // paint/finish nouns
  'exterior-primer','floor-primer','floor-sealer','concrete-etcher','semi-gloss','paint-roller',
  // firewood
  'oak-firewood','hardwood-firewood','maple-firewood','half-cord','full-cord','rick-of-wood',
  // window coverings as product nouns
  'plantation-blinds','roller-shades','vertical-blinds','wood-blinds','cellular-shades','mini-blinds','solar-shades',
  // material/product nouns
  'mineral-wool','felt-paper','rigid-foam','grasscloth','siding-panels','frp-wall-panels',
  'beadboard-paneling','panel-doors','solid-wood-doors','stone-floor','marble-floor',
  // film/tint nouns
  'privacy-film','solar-film','security-film','low-e-window-film','uv-blocking-film',
  'frosted-film','dyed-tint','ceramic-tint','carbon-tint',
  // countertop product nouns
  'corian-countertops','solid-surface-countertops','silestone-countertops',
  'stainless-steel-countertops','wood-countertops','stone-countertops',
  // other non-calc nouns
  'climate-controlled','turf-field','welded-wire','psi-concrete','two-coats',
  'heating-season','rotary-head','grout-masonry',
]);

function removeFromCsv(path, slugIdx = 0) {
  const raw = readFileSync(path, 'utf8');
  const lines = raw.split('\n');
  const header = lines[0];
  const colIdx = header.split(',').indexOf('slug');
  const idx = colIdx >= 0 ? colIdx : slugIdx;
  const before = lines.length - 1;
  const kept = lines.slice(1).filter(l => {
    if (!l.trim()) return false;
    const s = l.split(',')[idx]?.trim();
    return !KILL.has(s);
  });
  writeFileSync(path, [header, ...kept].join('\n'));
  return { before, after: kept.length };
}

const r1 = removeFromCsv(resolve(ROOT, 'out/final-keywords-deduped.csv'));
const r2 = removeFromCsv(resolve(ROOT, 'out/build-queue.csv'));
const r3 = removeFromCsv(resolve(ROOT, 'out/build-queue-with-kp-vol.csv'));

console.log(`final-keywords-deduped.csv: ${r1.before} → ${r1.after}`);
console.log(`build-queue.csv: ${r2.before} → ${r2.after}`);
console.log(`build-queue-with-kp-vol.csv: ${r3.before} → ${r3.after}`);
console.log(`Killed: ${KILL.size} non-calc nouns`);
