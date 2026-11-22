// One-off sizing check (2026-11-22): how many catalog videos are long enough for "3 hour" / "8 hour" ASMR pages.
// Reads public/creator-data/*.json (no network). Prints counts only.
import { readdirSync, readFileSync } from 'node:fs';
const DIR = 'public/creator-data';
const H = 3600;
const buckets = { '>=1h': 0, '>=3h': 0, '>=8h': 0, '>=10h': 0 };
const sleep = { '>=3h': 0, '>=8h': 0 }, noTalk = { '>=3h': 0, '>=8h': 0 };
const creators = { '>=3h': new Set(), '>=8h': new Set() };
let total = 0;
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  let d; try { d = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')); } catch { continue; }
  for (const v of d.all || []) {
    total++;
    for (const [k, min] of [['>=1h', H], ['>=3h', 3 * H], ['>=8h', 8 * H], ['>=10h', 10 * H]]) if (v.d >= min) buckets[k]++;
    for (const [k, min] of [['>=3h', 3 * H], ['>=8h', 8 * H]]) if (v.d >= min) {
      creators[k].add(f);
      if (/sleep|insomnia|bed|night/i.test(v.t)) sleep[k]++;
      if (/no talking|without talking|no voice/i.test(v.t)) noTalk[k]++;
    }
  }
}
console.log(JSON.stringify({ total, ...buckets, sleepTitle: sleep, noTalkingTitle: noTalk, creators3h: creators['>=3h'].size, creators8h: creators['>=8h'].size }));
