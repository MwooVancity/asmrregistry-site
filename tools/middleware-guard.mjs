#!/usr/bin/env node
// tools/middleware-guard.mjs
//
// Lightweight prebuild guard: verifies src/middleware.ts does NOT lowercase
// /video/ paths (case-sensitive YouTube IDs). Runs as part of `npm run prebuild`.
//
// Exit 1 = BLOCKER (build should not proceed).
// Exit 0 = guard present and correct.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MW = resolve(ROOT, 'src', 'middleware.ts');

if (!existsSync(MW)) {
  console.log('⚠ middleware-guard: src/middleware.ts not found — SKIPPED');
  process.exit(0);
}

const src = readFileSync(MW, 'utf8');

// 1. Must have a /video/ guard
const hasVideoGuard = /startsWith\(['"`]\/video\/['"`]\)/.test(src);
if (!hasVideoGuard) {
  console.error(
    '❌ BLOCKER: src/middleware.ts has NO /video/ case-sensitivity guard.\n' +
    '   YouTube IDs are case-sensitive. Without a guard, the lowercase\n' +
    '   middleware will 301-redirect all video URLs to lowercased versions,\n' +
    '   causing universal 404s.\n\n' +
    '   Fix: add  if (!path.startsWith(\'/video/\'))  before toLowerCase().\n'
  );
  process.exit(1);
}

// 2. Guard must be BEFORE toLowerCase
const guardIdx = src.search(/startsWith\(['"`]\/video\/['"`]\)/);
const lowerIdx = src.indexOf('toLowerCase()');
if (lowerIdx >= 0 && guardIdx > lowerIdx) {
  console.error(
    '❌ BLOCKER: src/middleware.ts /video/ guard is AFTER toLowerCase() — ineffective.\n' +
    '   Move the guard BEFORE the toLowerCase call.\n'
  );
  process.exit(1);
}

// 3. Guard must be negated (skip video, not target video)
const positiveBlock = src.match(
  /if\s*\(\s*path\.startsWith\(['"`]\/video\/['"`]\)\s*\)\s*\{[^}]*toLowerCase/
);
if (positiveBlock) {
  console.error(
    '❌ BLOCKER: src/middleware.ts lowercases /video/ paths (positive guard).\n' +
    '   Must be NEGATED: if (!path.startsWith(\'/video/\')) to SKIP lowercase.\n'
  );
  process.exit(1);
}

console.log('✅ middleware-guard: /video/ case-sensitivity guard present and correct.');
process.exit(0);
