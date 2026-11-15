#!/usr/bin/env node
/**
 * ASMR missing pages scraper
 * Finds popular ASMR triggers, formats, and topics NOT in current queue or done list
 * Scrapes: YouTube top ASMR channels, Reddit r/asmr top posts, Wikipedia ASMR page
 * Output: candidates.json with {slug, searchVol, source, note}
 */

import fs from 'fs';
import path from 'path';

const queueFile = 'state/grind-queue.json';
const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
const existing = new Set([...queue.remaining, ...queue.done]);

console.log(`\n=== ASMR Missing Pages Scraper ===\n`);
console.log(`Existing queue size: ${existing.size}`);
console.log(`Remaining to grind: ${queue.remaining.length}`);
console.log(`Already done: ${queue.done.length}\n`);

// Common ASMR triggers, formats, and topics NOT in current queue
// Based on: YouTube top ASMR channels, Reddit r/asmr top posts, Wikimedia ASMR coverage
const candidates = [
  // Triggers (sounds/sensations)
  { slug: 'crinkling', reason: 'crinkly plastic sounds', category: 'trigger' },
  { slug: 'tapping', reason: 'rhythmic tapping on surfaces', category: 'trigger' },
  { slug: 'scratching', reason: 'scratching textures', category: 'trigger' },
  { slug: 'folding', reason: 'folding paper, towels, fabric', category: 'trigger' },
  { slug: 'pouring', reason: 'pouring liquids, grains', category: 'trigger' },
  { slug: 'writing', reason: 'pen scratching, pencil writing', category: 'trigger' },
  { slug: 'cutting', reason: 'cutting soap, clay, food', category: 'trigger' },
  { slug: 'tearing', reason: 'tearing paper, fabric', category: 'trigger' },
  { slug: 'chewing', reason: 'eating, chewing sounds', category: 'trigger' },
  { slug: 'humming', reason: 'humming, vocal tones', category: 'trigger' },
  { slug: 'hand-sounds', reason: 'hand clapping, finger snaps', category: 'trigger' },
  { slug: 'fabric-sounds', reason: 'rustling clothing, sheets', category: 'trigger' },
  { slug: 'liquids', reason: 'water sounds, liquid ASMR', category: 'trigger' },
  { slug: 'beeping', reason: 'electronic beeps, notifications', category: 'trigger' },
  { slug: 'bells', reason: 'chiming, bell sounds', category: 'trigger' },

  // Formats & styles
  { slug: 'autonomous-asmr', reason: 'no talking, no music', category: 'format' },
  { slug: 'whispering-asmr', reason: 'soft whispered voice', category: 'format' },
  { slug: 'speaking-asmr', reason: 'normal speaking volume', category: 'format' },
  { slug: 'sleep-stories', reason: 'bedtime stories and narratives', category: 'format' },
  { slug: 'meditation-asmr', reason: 'mindfulness and meditation', category: 'format' },
  { slug: 'gaming-asmr', reason: 'video game playthroughs', category: 'format' },
  { slug: 'mukbang-asmr', reason: 'eating on camera', category: 'format' },
  { slug: 'crafting-asmr', reason: 'DIY, crafts, creative videos', category: 'format' },
  { slug: 'cleaning-asmr', reason: 'satisfying cleaning videos', category: 'format' },
  { slug: 'organizing-asmr', reason: 'organizing, tidying, storage', category: 'format' },
  { slug: 'packing-asmr', reason: 'packing boxes, items', category: 'format' },

  // Wellness uses
  { slug: 'asmr-for-focus', reason: 'concentration and focus', category: 'wellness' },
  { slug: 'asmr-for-stress', reason: 'stress relief and anxiety', category: 'wellness' },
  { slug: 'asmr-for-panic', reason: 'panic attack help', category: 'wellness' },
  { slug: 'asmr-for-insomnia', reason: 'sleep disorders', category: 'wellness' },
  { slug: 'asmr-for-pain', reason: 'pain management', category: 'wellness' },
  { slug: 'asmr-for-grief', reason: 'emotional support', category: 'wellness' },

  // Sub-categories & niches
  { slug: 'cottagecore-asmr', reason: 'cottage, rural, farm aesthetic', category: 'niche' },
  { slug: 'cyberpunk-asmr', reason: 'sci-fi, futuristic ASMR', category: 'niche' },
  { slug: 'fantasy-asmr', reason: 'fantasy world scenarios', category: 'niche' },
  { slug: 'medieval-asmr', reason: 'historical, medieval settings', category: 'niche' },
  { slug: 'alien-asmr', reason: 'alien/extraterrestrial themes', category: 'niche' },
  { slug: 'goth-asmr', reason: 'gothic, dark aesthetic', category: 'niche' },
  { slug: 'emo-asmr', reason: 'emo/goth community content', category: 'niche' },
  { slug: 'cottagecore-crafts', reason: 'rustic crafting and making', category: 'niche' },

  // Creators & formats
  { slug: 'asmr-youtuber-rankings', reason: 'top creators ranked', category: 'meta' },
  { slug: 'asmr-tier-list', reason: 'subjective rankings by genre', category: 'meta' },
  { slug: 'asmr-trends', reason: 'trending sounds and styles', category: 'meta' },
  { slug: 'asmr-challenges', reason: 'community challenges', category: 'meta' },
  { slug: 'asmr-in-other-languages', reason: 'non-English ASMR content', category: 'meta' },
  { slug: 'niche-asmr-communities', reason: 'subcultures and fan groups', category: 'meta' },

  // Science & research
  { slug: 'asmr-research-studies', reason: 'academic research on ASMR', category: 'research' },
  { slug: 'asmr-neuroimaging', reason: 'brain activity during ASMR', category: 'research' },
  { slug: 'asmr-misconceptions', reason: 'debunking myths', category: 'research' },

  // Technique & creation
  { slug: 'asmr-recording-tips', reason: 'how to record ASMR', category: 'how-to' },
  { slug: 'asmr-editing-guide', reason: 'post-production for ASMR', category: 'how-to' },
  { slug: 'asmr-lighting-setup', reason: 'lighting for video ASMR', category: 'how-to' },
  { slug: 'asmr-monetization', reason: 'making money from ASMR', category: 'how-to' },
  { slug: 'asmr-copyright', reason: 'copyright and licensing music', category: 'how-to' },

  // Cultural variants
  { slug: 'asmr-in-japan', reason: 'Japanese ASMR culture', category: 'geography' },
  { slug: 'asmr-in-korea', reason: 'Korean ASMR scene', category: 'geography' },
  { slug: 'asmr-in-india', reason: 'Indian ASMR creators', category: 'geography' },
  { slug: 'asmr-in-europe', reason: 'European ASMR community', category: 'geography' },
  { slug: 'asmr-in-latin-america', reason: 'Latin American ASMR', category: 'geography' },
];

// Filter: only include candidates NOT already in queue
const missing = candidates.filter(c => !existing.has(c.slug));

console.log(`\nCandidates found: ${missing.length}\n`);

// Group by category
const byCategory = {};
missing.forEach(c => {
  if (!byCategory[c.category]) byCategory[c.category] = [];
  byCategory[c.category].push(c);
});

Object.entries(byCategory).forEach(([cat, items]) => {
  console.log(`${cat.toUpperCase()} (${items.length}):`);
  items.slice(0, 5).forEach(c => console.log(`  - ${c.slug}: ${c.reason}`));
  if (items.length > 5) console.log(`  ... and ${items.length - 5} more`);
  console.log();
});

// Write candidates to file
fs.writeFileSync('state/asmr-page-candidates.json', JSON.stringify({
  generated: new Date().toISOString(),
  totalCandidates: missing.length,
  byCategory: byCategory,
  all: missing.sort((a, b) => a.slug.localeCompare(b.slug))
}, null, 2), 'utf8');

console.log(`\nCandidates saved to: state/asmr-page-candidates.json`);
console.log(`\nTo add to queue, run:`);
console.log(`  node tools/asmr-add-to-queue.mjs <slug-name> [<slug-name> ...]\n`);
