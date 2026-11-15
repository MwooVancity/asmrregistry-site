// Blocks a push when a tracked file holds a key (the repo is public since 2026-11-15).
// Checks: common key shapes, plus the exact values in the local .env (never printed).
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const SHAPES = [/AIza[0-9A-Za-z_-]{30,}/, /\bsk-[0-9a-f]{24,}/, /\bgh[pousr]_[0-9A-Za-z]{30,}/, /xox[bp]-[0-9A-Za-z-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
const values = existsSync('.env')
  // Only secret-named entries: account and database IDs in .env are public identifiers (they sit in wrangler.toml).
  ? readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z_]*=/.test(l))
      .map((l) => l.split('=').slice(1).join('=').replace(/^["']|["']$/g, '').trim()).filter((v) => v.length >= 16)
  : [];
const files = execSync('git ls-files -z', { encoding: 'utf8', maxBuffer: 64e6 }).split('\0').filter(Boolean);
const hits = [];
for (const f of files) {
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|mp3|wav)$/i.test(f)) continue;
  let t; try { t = readFileSync(f, 'utf8'); } catch { continue; }
  if (SHAPES.some((re) => re.test(t)) || values.some((v) => t.includes(v))) hits.push(f);
}
if (hits.length) { console.error('secret-scan: possible key in', hits.join(', '), '- push blocked'); process.exit(1); }
console.log(`secret-scan: ${files.length} files, no keys`);
