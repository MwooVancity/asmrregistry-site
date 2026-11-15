// Builds public/video-map/<shard>.json: { "<videoId>": "<creatorSlug>" } from public/creator-data/*.json,
// so /video/<id>/ can 301 to /creators/<slug>/v/<id>/. Sharded by the id's first character because the full
// map at 1.9M videos is ~70 MB (~37 bytes an entry). Shard name is the char code, not the char: ids are
// case-sensitive and Windows disks are not, so "a.json" and "A.json" would overwrite each other.
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'public/creator-data';
const OUT = 'public/video-map';
const MAX_AGE = 30 * 864e5; // YouTube data rule: older files are not trusted

export function shardOf(id) { return String(id).charCodeAt(0); }

const shards = {};
let files = 0, skipped = 0, entries = 0;
const names = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter(f => f.endsWith('.json')) : [];
for (const f of names) {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')); } catch { skipped++; continue; }
  const age = Date.now() - Date.parse(d?.fetched);
  if (!(age <= MAX_AGE) || !Array.isArray(d.all)) { skipped++; continue; }
  const slug = f.slice(0, -5);
  files++;
  for (const v of d.all) {
    if (typeof v?.id !== 'string' || !v.id) continue;
    const s = (shards[shardOf(v.id)] ||= {});
    // Expiry = oldest data date in the shard + 30 days: the page stops redirecting after it (no 301 to a 410).
    const exp = new Date(Date.parse(d.fetched) + 30 * 864e5).toISOString().slice(0, 10);
    if (!s.__exp || exp < s.__exp) s.__exp = exp; // keep the earliest expiry in the shard
    if (!(v.id in s)) { s[v.id] = slug; entries++; } // first creator file wins on duplicates
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const [k, m] of Object.entries(shards)) {
  const txt = JSON.stringify(m);
  bytes += txt.length;
  fs.writeFileSync(path.join(OUT, `${k}.json`), txt);
}
console.log(`video-map: ${entries} entries from ${files} creator files (${skipped} skipped), ${Object.keys(shards).length} shards, ${(bytes / 1024).toFixed(1)} KB`);
