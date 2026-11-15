#!/usr/bin/env node
/**
 * ASMR batch grind orchestrator
 * Spawns research briefs + prose agents for all remaining queue pages
 * Run: node tools/asmr-grind-batch-orchestrate.mjs
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const projRoot = process.cwd();
const queueFile = path.join(projRoot, 'state/grind-queue.json');
const contentFile = path.join(projRoot, 'src/lib/asmr-page-content.json');

// Load queue
const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
const slugs = queue.remaining.slice(0, 30); // 30 pages

console.log(`\n=== ASMR Batch Grind Orchestrator ===\n`);
console.log(`Batch: ${slugs.length} pages\n`);
console.log(`Slugs: ${slugs.slice(0, 5).join(', ')}${slugs.length > 5 ? ` ... + ${slugs.length - 5} more` : ''}\n`);

// Generate claude CLI commands for each slug
// The /grind command in claude will be invoked for each slug sequentially
const commands = slugs.map(slug =>
  `claude /grind --auto ${slug}`
);

console.log(`Next: Copy-paste these commands into claude CLI to grind in parallel:\n`);
commands.slice(0, 3).forEach((cmd, i) => console.log(`  ${cmd}`));
if (commands.length > 3) console.log(`  ... and ${commands.length - 3} more\n`);

console.log(`Or run batch: claude /grind-batch\n`);
console.log(`After grinding:\n`);
console.log(`  1. Run: node tools/asmr-apply-batch.mjs\n`);
console.log(`  2. Run: node tools/asmr-gate-batch.mjs\n`);
console.log(`  3. Run: git add src/lib/asmr-page-content.json && git commit -m "content(asmr): rewrite 30 pages" && git push\n`);
