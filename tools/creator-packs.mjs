#!/usr/bin/env node
// Builds per-creator data packs from the D1 catalog for creator-page writing.
// Input: scratch channels.json + creator-match.json (from the channel GROUP BY query and ledger match).
// Output: <out>/creator-packs.json  { slug: { name, channel_id, demand, stats..., top, similar } }
// Usage: node tools/creator-packs.mjs <scratchDir> [count=50]
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DIR = process.argv[2]; const COUNT = Number(process.argv[3] || 50);
const ch = JSON.parse(readFileSync(DIR + '/channels.json', 'utf8'))[0].results;
const match = JSON.parse(readFileSync(DIR + '/creator-match.json', 'utf8'));
const demandBy = {}; for (const m of match) if (m.channel_id && (!demandBy[m.channel_id] || m.demand > demandBy[m.channel_id].demand)) demandBy[m.channel_id] = m;
const EXISTING = { 'sio-asmr': 1, 'sulgi-asmr': 1, 'zoey-asmr': 1, 'hongyu-asmr': 1, 'jaeyeol-asmr': 1, 'zach-choi': 1, 'eevy-asmr': 1, 'rapunzel-asmr': 1, 'chels-asmr': 1, 'dido-asmr': 1 };
// Not ASMR creators (brands/shows) or unsafe for AdSense.
const SKIP = /^(W Magazine|Bob Ross|Calm|Bayashi TV)$|kazephoto|ero|amouranth|nsfw|lewd|onlyfans/i;

const slugify = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ı/g,'i').toLowerCase().replace(/\[|\]/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pool = ch.filter(c => c.n >= 15 && !SKIP.test(c.channel_name))
  .sort((a, b) => ((demandBy[b.channel_id] || {}).demand || 0) - ((demandBy[a.channel_id] || {}).demand || 0) || b.n - a.n);

const picked = []; const seen = new Set();
for (const c of pool) {
  if (picked.length >= COUNT) break;
  let slug = demandBy[c.channel_id]?.slug || slugify(c.channel_name);
  if (!/asmr/.test(slug) && !/asmr/i.test(c.channel_name)) slug = slug + '-asmr';
  if (!slug || slug.length < 3 || seen.has(slug) || !/[a-z]{3}/.test(slug)) continue;
  seen.add(slug); picked.push({ slug, ...c });
}
// Keep existing profile slugs mapped to their channel (rewrite them under the new prompt).
const existing = JSON.parse(execSync(`npx wrangler d1 execute asmr-registry --remote --json --command "SELECT slug, channel_id FROM creator_profiles"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
for (const e of existing) {
  const i = picked.findIndex(p => p.channel_id === e.channel_id);
  if (i >= 0) picked[i].slug = e.slug;
  else { const c = ch.find(x => x.channel_id === e.channel_id); if (c && c.n >= 5) picked.push({ slug: e.slug, ...c }); }
}

const ids = picked.map(p => `'${p.channel_id.replace(/'/g, "''")}'`).join(',');
const sql = `SELECT channel_id,id,title,view_count,duration_seconds,primary_trigger,intensity,modifiers,intents,language,publish_date,format FROM videos WHERE status='published' AND channel_id IN (${ids})`;
const rows = JSON.parse(execSync(`npx wrangler d1 execute asmr-registry --remote --json --command "${sql}"`, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;

const med = a => { const s = a.filter(x => x > 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const arr = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
const packs = {};
for (const p of picked) {
  const v = rows.filter(r => r.channel_id === p.channel_id);
  if (!v.length) continue;
  const count = (key) => { const m = {}; for (const r of v) { const k = r[key] || 'unknown'; m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const trig = count('primary_trigger').filter(([k]) => k !== 'unknown');
  const mods = {}; for (const r of v) for (const m of arr(r.modifiers)) mods[m] = (mods[m] || 0) + 1;
  const intents = {}; for (const r of v) for (const m of arr(r.intents)) intents[m] = (intents[m] || 0) + 1;
  const dates = v.map(r => r.publish_date).filter(Boolean).sort();
  const pct = n => Math.round(100 * n / v.length);
  packs[p.slug] = {
    name: p.channel_name, channel_id: p.channel_id, searchDemand: demandBy[p.channel_id]?.demand || 0,
    videosInCatalog: v.length,
    triggerShare: trig.slice(0, 6).map(([k, n]) => ({ trigger: k, pct: pct(n) })),
    medianMinutes: Math.round(med(v.map(r => r.duration_seconds)) / 60),
    shareOver30Min: pct(v.filter(r => r.duration_seconds >= 1800).length),
    shareUnder10Min: pct(v.filter(r => r.duration_seconds > 0 && r.duration_seconds < 600).length),
    modifierShare: Object.entries(mods).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ modifier: k, pct: pct(n) })),
    intentShare: Object.entries(intents).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ intent: k, pct: pct(n) })),
    avgIntensity: Math.round(10 * v.reduce((s, r) => s + (r.intensity || 0), 0) / v.filter(r => r.intensity).length) / 10 || null,
    mainLanguage: count('language')[0]?.[0] || 'unknown',
    firstAndLatestUploadInCatalog: dates.length ? [dates[0].slice(0, 7), dates[dates.length - 1].slice(0, 7)] : null,
    topVideos: [...v].sort((a, b) => b.view_count - a.view_count).slice(0, 8).map(r => ({ id: r.id, title: r.title, minutes: Math.round((r.duration_seconds || 0) / 60), trigger: r.primary_trigger })),
  };
}
// Similar creators: cosine over trigger shares, only among built pages so links resolve.
const vec = s => Object.fromEntries(packs[s].triggerShare.map(t => [t.trigger, t.pct]));
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (const k in a) { na += a[k] ** 2; if (b[k]) d += a[k] * b[k]; } for (const k in b) nb += b[k] ** 2; return d / Math.sqrt(na * nb || 1); };
for (const s of Object.keys(packs)) {
  packs[s].similar = Object.keys(packs).filter(o => o !== s).map(o => [o, cos(vec(s), vec(o))]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(x => x[1] > 0.3).map(([o]) => ({ slug: o, name: packs[o].name }));
}
writeFileSync(DIR + '/creator-packs.json', JSON.stringify(packs, null, 1));
console.log(`packs: ${Object.keys(packs).length} | rows read: ${rows.length}`);
console.log(Object.entries(packs).map(([s, p]) => `${s}(${p.videosInCatalog}${p.searchDemand ? ',d' + p.searchDemand : ''})`).join(' '));
