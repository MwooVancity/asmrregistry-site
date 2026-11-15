// Category pages data (/asmr/<slug>/): counts across every creator file, built from titles only ("labelled").
// Usage: node scripts/prebuild-categories.mjs [creatorDataDir]   (default public/creator-data)
import fs from 'node:fs';
import path from 'node:path';
import { SUGGESTIVE } from './lib/creator-gate-lib.mjs';

const SRC = process.argv[2] || 'public/creator-data';
const OUT = 'public/category-data';
const SITE = 'https://asmrregistry.com';
const MIN = 30;

export const CATS = [
  ['whispering', 'Whispering', /whisper/i], ['tapping', 'Tapping', /tap(ping)?\b/i], ['mouth-sounds', 'Mouth sounds', /mouth sound/i],
  ['ear-cleaning', 'Ear cleaning', /ear clean/i], ['ear-licking', 'Ear licking', /ear lick|licking/i], ['ear-eating', 'Ear eating', /ear eat/i],
  ['kisses', 'Kisses', /kiss/i], ['massage', 'Massage', /massage/i], ['hair-play', 'Hair play', /hair (play|brush)|scalp/i],
  ['roleplay', 'Roleplay', /role ?play|\brp\b/i], ['boyfriend-roleplay', 'Boyfriend roleplay', /boyfriend/i],
  ['girlfriend-roleplay', 'Girlfriend roleplay', /girlfriend/i], ['soft-spoken', 'Soft spoken', /soft[ -]?spoken/i],
  ['no-talking', 'No talking', /no talking/i], ['eating', 'Eating', /eating|mukbang/i], ['rain', 'Rain', /\brain\b/i],
  ['sleep', 'Sleep', /sleep/i], ['binaural', 'Binaural', /binaural|3dio|ku ?100/i],
];

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const files = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter((f) => f.endsWith('.json')) : [];
const creators = [];
let skipped = 0;
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
    if (!Array.isArray(d.all) || !d.channel || !(Date.now() - Date.parse(d.fetched) <= 30 * 864e5)) { skipped++; continue; }
    creators.push({ slug: f.slice(0, -5), title: d.channel.title, typical: d.lengths?.medianMin ?? null, all: d.all });
  } catch { skipped++; } // half-written or unreadable file
}

fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f)); // drop categories that fell below MIN
const built = [];
for (const [slug, name, re] of CATS) {
  const seen = new Set(), vids = [], per = new Map();
  for (const c of creators) for (const v of c.all) {
    if (!v?.id || seen.has(v.id) || typeof v.t !== 'string' || !re.test(v.t) || SUGGESTIVE.test(v.t)) continue;
    seen.add(v.id);
    vids.push({ id: v.id, t: v.t, v: v.v ?? null, d: v.d || 0, p: v.p || '', slug: c.slug, c: c.title });
    per.set(c.slug, (per.get(c.slug) || 0) + 1);
  }
  if (vids.length < MIN) continue;
  const secs = vids.map((v) => v.d).filter((d) => d > 0);
  const top = [...per].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s, n]) => { const c = creators.find((x) => x.slug === s); return { slug: s, title: c.title, count: n, typical: c.typical }; });
  const data = {
    slug, name, built: new Date().toISOString().slice(0, 10), count: vids.length, creators: per.size,
    medianMin: Math.round(median(secs) / 60), over60Pct: secs.length ? Math.round((secs.filter((d) => d > 3600).length / secs.length) * 100) : 0,
    topCreators: top,
    top: [...vids].sort((a, b) => (b.v ?? -1) - (a.v ?? -1)).slice(0, 100),
    newest: [...vids].sort((a, b) => b.p.localeCompare(a.p)).slice(0, 20),
  };
  fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify(data));
  built.push({ slug, name, count: vids.length });
}
fs.writeFileSync(path.join(OUT, '_index.json'), JSON.stringify(built));
fs.writeFileSync('public/sitemap-categories.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${built.map((b) => `<url><loc>${SITE}/asmr/${b.slug}/</loc></url>`).join('\n')}\n</urlset>\n`);
console.log(`categories: ${creators.length} creator files read, ${skipped} skipped, ${built.length} categories written: ${built.map((b) => `${b.slug}=${b.count}`).join(' ')}`);
