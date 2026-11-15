#!/usr/bin/env node
/**
 * Add candidate pages to asmrregistry grind queue
 * Usage: node tools/asmr-add-to-queue.mjs folding pouring writing cutting tearing
 */

import fs from 'fs';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node asmr-add-to-queue.mjs <slug> [<slug> ...]\n');
  console.log('Example: node asmr-add-to-queue.mjs folding pouring writing\n');
  process.exit(1);
}

const queueFile = 'state/grind-queue.json';
const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
const existing = new Set([...queue.remaining, ...queue.done]);

const added = [];
const skipped = [];

for (const slug of args) {
  if (existing.has(slug)) {
    skipped.push({ slug, reason: 'already in queue or done' });
  } else {
    queue.remaining.push(slug);
    added.push(slug);
    existing.add(slug);
  }
}

fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2), 'utf8');

console.log(`\n=== Queue Update ===\n`);
console.log(`Added: ${added.length}\n${added.map(s => '  - ' + s).join('\n')}\n`);
if (skipped.length > 0) {
  console.log(`Skipped: ${skipped.length}\n${skipped.map(s => `  - ${s.slug} (${s.reason})`).join('\n')}\n`);
}
console.log(`Queue now: ${queue.remaining.length} remaining, ${queue.done.length} done\n`);
