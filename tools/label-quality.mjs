#!/usr/bin/env node
// Label quality proxy per trigger: of the videos we recommend for a trigger, what share name that trigger (or a close
// word) in their title? A low share means the AI tag is often a guess. It is a proxy, not a listen: a tapping video
// titled "Sleepy triggers" counts as unconfirmed even if it is all tapping.
// Usage: node tools/label-quality.mjs   (reads public/finder-videos.json; flags triggers under 40%)
import { readFileSync } from 'fs';
const rows = JSON.parse(readFileSync('public/finder-videos.json', 'utf8'));
const WORDS = {
  'eating-sounds': /eat|mukbang|먹방|chew|crunch|bite|food/i, 'mouth-sounds': /mouth|tongue|tk|lip|spit|click/i,
  'personal-attention': /attention|roleplay|role play|exam|haircut|spa|makeup|doctor|care/i, 'no-talking': /no talk|no-talk|silent|no voice/i,
  'soft-speaking': /soft ?spoken|soft speaking|ramble|chat/i, 'hair-play': /hair/i, 'water-sounds': /water/i,
  'glass-sounds': /glass/i, 'page-turning': /page|book|magazine/i, 'positive-affirmations': /affirmation|positive|you are/i,
  'light-patterns': /light|visual/i, 'white-noise': /white noise|fan|static|hair ?dryer/i, binaural: /binaural|3dio|ear to ear|8d|3d/i,
  nature: /nature|forest|bird|wind|river|rain|ocean/i, fire: /fire|fireplace|crackl/i,
};
const by = {};
for (const r of rows) (by[r[5]] ||= []).push(r[1]);
const out = Object.entries(by).filter(([, t]) => t.length >= 20).map(([trig, titles]) => {
  const re = WORDS[trig] || new RegExp(trig.split('-')[0].replace(/s$/, ''), 'i');
  return [trig, titles.length, Math.round((100 * titles.filter((t) => re.test(t)).length) / titles.length)];
}).sort((a, b) => a[2] - b[2]);
for (const [t, n, p] of out) console.log(`${p < 40 ? 'LOW ' : '    '}${t.padEnd(22)} ${String(p).padStart(3)}% of ${n} titles name it`);
console.log(`\n${out.filter((o) => o[2] < 40).length} of ${out.length} triggers under 40%`);

// Data health for everything the finders can recommend.
const ids = rows.map((r) => r[0]);
const dupes = ids.length - new Set(ids).size;
const badLen = rows.filter((r) => !(r[4] >= 3)).length;
const badId = rows.filter((r) => !/^[\w-]{11}$/.test(r[0])).length;
const topCreator = Object.entries(rows.reduce((m, r) => ((m[r[2]] = (m[r[2]] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0];
console.log(`rows ${rows.length} | duplicate ids ${dupes} | under 3 min or unknown ${badLen} | malformed YouTube ids ${badId} | most common creator ${topCreator[0]} (${topCreator[1]}, ${Math.round((100 * topCreator[1]) / rows.length)}%)`);
if (dupes || badLen || badId) process.exitCode = 1;
