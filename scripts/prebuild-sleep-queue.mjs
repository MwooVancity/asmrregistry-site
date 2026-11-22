// Home-page "play it back to back" queues (owner 2026-11-22). Reads public/creator-data/*.json (no network) and writes
// src/lib/sleep-queue.json: three queues of up to 50 video ids, chosen from titles, most watched first, at most 2 per creator.
// Never throws and never blocks a build: on any problem it writes an empty file and the home page block stays hidden.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ADULT, CLAIM } from './lib/creator-gate-lib.mjs';

const DIR = 'public/creator-data', OUT = 'src/lib/sleep-queue.json', MAX_AGE = 30 * 864e5, H = 3600;
const SLEEP = /sleep|insomnia|bedtime|overnight|night/i;
const QUEUES = {
  notalk: { label: 'No talking, 3 hours or longer', min: 3 * H, re: /no talking|without talking|no voice|no speaking|no vocals/i },
  whisper: { label: 'Whispering for sleep, 1 hour or longer', min: H, re: /whisper/i, also: SLEEP },
  rain: { label: 'Rain and storms, 3 hours or longer', min: 3 * H, re: /\brain(y|ing)?\b|thunder|storm/i, not: /mouth|dialogue|role ?play|\brp\b|talk|whisper|tapping|scratch/i },
};
const empty = () => writeFileSync(OUT, JSON.stringify({ built: '', queues: {} }) + '\n');

try {
  const pool = Object.fromEntries(Object.keys(QUEUES).map((k) => [k, []]));
  let files = 0;
  if (existsSync(DIR)) for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
    let d; try { d = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')); } catch { continue; }
    if (!(Date.now() - Date.parse(d?.fetched) <= MAX_AGE) || !Array.isArray(d.all)) continue; // stale data is not used
    files++;
    for (const v of d.all) {
      if (!v?.id || typeof v.t !== 'string' || !(v.d > 0) || ADULT.test(v.t) || CLAIM.test(v.t)) continue;
      for (const [k, q] of Object.entries(QUEUES)) if (v.d >= q.min && q.re.test(v.t) && (!q.also || q.also.test(v.t)) && !(q.not && q.not.test(v.t))) pool[k].push({ id: v.id, v: v.v ?? 0, c: f });
    }
  }
  const out = { built: new Date().toISOString().slice(0, 10), queues: {} };
  for (const [k, q] of Object.entries(QUEUES)) {
    const per = new Map(), ids = [];
    for (const x of pool[k].sort((a, b) => b.v - a.v)) {
      if ((per.get(x.c) || 0) >= 2) continue; // variety: two per creator at most
      per.set(x.c, (per.get(x.c) || 0) + 1);
      ids.push(x.id);
      if (ids.length === 50) break;
    }
    if (ids.length >= 20) out.queues[k] = { label: q.label, n: pool[k].length, creators: new Set(pool[k].map((x) => x.c)).size, ids };
  }
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  console.log(`prebuild-sleep-queue: ${files} creator files, ` + Object.entries(out.queues).map(([k, q]) => `${k}=${q.ids.length} of ${q.n} (${q.creators} creators)`).join(', '));
} catch (e) {
  console.warn('prebuild-sleep-queue: failed, block stays hidden:', e.message);
  try { empty(); } catch {}
}
