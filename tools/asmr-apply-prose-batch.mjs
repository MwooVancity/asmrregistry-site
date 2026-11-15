#!/usr/bin/env node
/**
 * Apply prose candidate JSON files to asmr-page-content.json
 * Usage: node tools/asmr-apply-prose-batch.mjs
 * Scans state/prose-candidate-*.json and applies all to src/lib/asmr-page-content.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projRoot = path.dirname(__dirname);

const stateDir = path.join(projRoot, 'state');
const contentFile = path.join(projRoot, 'src/lib/asmr-page-content.json');

// Load content
const content = JSON.parse(fs.readFileSync(contentFile, 'utf8'));

// Find all prose-candidate-*.json files
const candidateFiles = fs.readdirSync(stateDir).filter(f => f.startsWith('prose-candidate-') && f.endsWith('.json'));

console.log(`\n=== Applying Prose Candidates ===\n`);
console.log(`Found ${candidateFiles.length} prose candidate files\n`);

let applied = 0;
let failed = 0;
const failures = [];

for (const file of candidateFiles) {
  const slug = file.replace('prose-candidate-', '').replace('.json', '');
  const filePath = path.join(stateDir, file);

  try {
    const prose = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Apply to content
    if (!content[slug]) {
      content[slug] = {};
    }

    // Merge prose fields
    Object.assign(content[slug], prose);
    content[slug].lastUpdated = new Date().toISOString().split('T')[0];

    applied++;
    console.log(`✓ ${slug}`);
  } catch (e) {
    failed++;
    failures.push({ slug, error: e.message });
    console.log(`✗ ${slug}: ${e.message}`);
  }
}

// Write back to content file
fs.writeFileSync(contentFile, JSON.stringify(content, null, 2), 'utf8');

console.log(`\n=== Results ===\n`);
console.log(`Applied: ${applied}`);
console.log(`Failed: ${failed}`);

if (failures.length > 0) {
  console.log(`\nFailures:`);
  failures.forEach(f => console.log(`  ${f.slug}: ${f.error}`));
}

console.log(`\nNext: run node tools/asmr-gate-batch.mjs\n`);
