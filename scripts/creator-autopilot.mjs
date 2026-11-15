#!/usr/bin/env node
// Daily creator pages. Picks the next eligible channels, writes bios with DeepSeek from catalog data only, publishes
// only what passes the gate. Run by .github/workflows/daily-creators.yml.
// Usage: node scripts/creator-autopilot.mjs [--dry] [--count N]
// Writes `published=N` to $GITHUB_OUTPUT so the workflow deploys only when something changed.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gateBio, SUGGESTIVE } from './lib/creator-gate-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const eq = line.indexOf('='); if (eq < 1 || line.startsWith('#')) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\r$/, '');
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {}
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const COUNT = args.includes('--count') ? Number(args[args.indexOf('--count') + 1]) : 25;
const MAX_ATTEMPTS = Math.ceil(COUNT * 1.6);   // cost cap: each attempt is up to 3 DeepSeek calls
const MIN_VIDEOS = 5;                          // owner 2026-11-15: copy the ASMR Index scale (was 15)
const MAX_SUGGESTIVE = 0.03;                   // more suggestive titles than this: skip the channel
const NOT_CREATORS = /^(W Magazine|Bob Ross|Calm|Bayashi TV)$|kazephoto|\bero\b|amouranth|nsfw|lewd|onlyfans/i;
const HEALTH_TITLE = /pain|therapy|treatment|cure|heal|pregnan|anxiety|depress|insomnia|adhd/i;
const MAX_CREATORS = 1200;                     // ponytail: creators-data.json ships in the Worker bundle (3 MB compressed limit). Past this, move it to KV.
const STATE = join(root, 'state/creator-autopilot.json');

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, DEEPSEEK_API_KEY: dsKey } = process.env;
const dbId = process.env.D1_DATABASE_ID || '4f8937a1-9629-4c8b-a343-9cfe238cc319';
if (!token || !account || !dsKey) { console.error('missing CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID or DEEPSEEK_API_KEY'); process.exit(1); }
const stop = (msg, code = 1) => { console.log(`::warning::creator-autopilot: ${msg}. Stopping.`); process.exit(code); }; // red run unless the pool is simply empty

const q = async (sql, params = []) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${dbId}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  if (!j.success) { const m = JSON.stringify(j.errors); if (/7500|exceeded/.test(m)) stop('D1 daily limit reached'); throw new Error(m.slice(0, 200)); }
  return j.result?.[0]?.results ?? [];
};
const prompt = readFileSync(join(root, '.claude/prompts/creator-master-prompt.txt'), 'utf8');
const deepseek = async (messages) => {
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${dsKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 900, temperature: 0.5, response_format: { type: 'json_object' }, messages }), signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`DeepSeek ${r.status}`);
  return JSON.parse((await r.json()).choices[0].message.content);
};
const slugify = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = x => (x || '').toLowerCase().replace(/asmr/g, '').replace(/[^a-z0-9]/g, '');
const arr = v => { try { return JSON.parse(v || '[]'); } catch { return []; } };
const med = a => { const s = a.filter(x => x > 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function buildPack(ch, v, similar) {
  const pct = n => Math.round(100 * n / v.length);
  const tally = (get) => { const m = {}; for (const r of v) for (const k of get(r)) m[k] = (m[k] || 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const dates = v.map(r => r.publish_date).filter(Boolean).sort();
  const safe = [...v].filter(r => !SUGGESTIVE.test(r.title) && !HEALTH_TITLE.test(r.title)).sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  return {
    name: ch.channel_name, channel_id: ch.channel_id, videosInCatalog: v.length,
    triggerShare: tally(r => (r.primary_trigger ? [r.primary_trigger] : [])).slice(0, 6).map(([trigger, n]) => ({ trigger, pct: pct(n) })),
    medianMinutes: Math.round(med(v.map(r => r.duration_seconds)) / 60),
    shareOver30Min: pct(v.filter(r => r.duration_seconds >= 1800).length),
    shareUnder10Min: pct(v.filter(r => r.duration_seconds > 0 && r.duration_seconds < 600).length),
    modifierShare: tally(r => arr(r.modifiers)).slice(0, 5).map(([modifier, n]) => ({ modifier, pct: pct(n) })),
    intentShare: tally(r => arr(r.intents)).slice(0, 4).map(([intent, n]) => ({ intent, pct: pct(n) })),
    mainLanguage: tally(r => [r.language || 'unknown'])[0]?.[0] || 'unknown',
    firstAndLatestUploadInCatalog: dates.length ? [dates[0].slice(0, 7), dates[dates.length - 1].slice(0, 7)] : null,
    topVideos: safe.slice(0, 8).map(r => ({ id: r.id, title: r.title, minutes: Math.round((r.duration_seconds || 0) / 60), trigger: r.primary_trigger })),
    similar,
  };
}

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { skipped: {}, runs: [] };
const profiles = await q('SELECT slug, channel_id, name, status FROM creator_profiles');
const blocked = new Set((await q("SELECT id FROM channels WHERE status = 'blocked'")).map(r => r.id));
if (profiles.length >= MAX_CREATORS) stop(`${profiles.length} creators reached the bundle cap`, 0);
const taken = new Set(profiles.map(p => p.channel_id));
const slugs = new Set(profiles.map(p => p.slug));
const dead = profiles.filter(p => p.status !== 'published').map(p => p.name);
const ledger = JSON.parse(readFileSync(join(root, 'src/lib/asmr-keyword-ledger.json'), 'utf8')).pages.filter(e => e.pageType === 'CREATOR_NAV');
const demand = {}; for (const e of ledger) { const k = norm(e.headKeyword); if (k && !(demand[k]?.d >= e.totalDemand)) demand[k] = { d: e.totalDemand, slug: e.slug }; }

const channels = await q(`SELECT channel_id, channel_name, COUNT(*) n FROM videos WHERE status = 'published' GROUP BY channel_id HAVING n >= ${MIN_VIDEOS}`);
const pool = channels.filter(c => !taken.has(c.channel_id) && !blocked.has(c.channel_id) && !state.skipped[c.channel_id] && !NOT_CREATORS.test(c.channel_name) && /[a-z]{3}/i.test(c.channel_name))
  .sort((a, b) => (demand[norm(b.channel_name)]?.d || 0) - (demand[norm(a.channel_name)]?.d || 0) || b.n - a.n);
console.log(`pool: ${pool.length} eligible of ${channels.length} channels with ${MIN_VIDEOS}+ videos`);
if (!pool.length) stop('no eligible channels left (ingest more before expecting pages)', 0);

const published = [], skipped = {};
let attempts = 0;
for (const ch of pool) {
  if (published.length >= COUNT || attempts >= MAX_ATTEMPTS) break;
  const v = await q('SELECT id, title, view_count, duration_seconds, primary_trigger, intents, modifiers, language, publish_date FROM videos INDEXED BY idx_videos_channel WHERE channel_id = ? AND status = ?', [ch.channel_id, 'published']);
  const skip = why => { skipped[ch.channel_id] = `${ch.channel_name}: ${why}`; console.log(`skip ${ch.channel_name}: ${why}`); };
  const bad = v.filter(r => SUGGESTIVE.test(r.title)).length / v.length;
  if (bad > MAX_SUGGESTIVE) { skip(`${Math.round(bad * 100)}% suggestive titles`); continue; }
  const pack = buildPack(ch, v, []); // similar creators are linked by the page itself, from the snapshot
  if (!pack.triggerShare.length || pack.triggerShare[0].pct < 15) { skip('no clear trigger data'); continue; }
  if (pack.topVideos.length < 3) { skip('fewer than 3 safe titles'); continue; }

  let slug = demand[norm(ch.channel_name)]?.slug || slugify(ch.channel_name);
  if (!/asmr/.test(slug)) slug += '-asmr';
  if (slugs.has(slug) || slug.length < 5) { skip(`slug clash ${slug}`); continue; }
  attempts++; // only channels that reach DeepSeek count toward the cost cap
  const messages = [
    { role: 'system', content: prompt + '\n\nThe similar list is empty, so in paragraph 3 describe the kind of channel to look for instead of naming anyone. Return JSON with keys editorial_bio, trigger_specialties, style_tags, signature_videos. Never name a video outside topVideos.' },
    { role: 'user', content: JSON.stringify(pack) },
  ];
  let bio = null, fails = [];
  for (let t = 0; t < 3 && !bio; t++) {
    try {
      const out = await deepseek(messages);
      fails = gateBio(out, pack, dead);
      if (!fails.length) bio = out;
      else messages.push({ role: 'assistant', content: JSON.stringify(out) }, { role: 'user', content: `Rejected. Fix all of these and return the full JSON again: ${fails.join('; ')}` });
    } catch (e) { fails = [`DeepSeek: ${e.message}`]; }
  }
  if (!bio) { skip(`gate: ${fails.slice(0, 3).join('; ')}`); continue; }

  slugs.add(slug);
  if (DRY) { console.log(`\n[dry] ${slug} (${v.length} videos)\n${bio.editorial_bio}\n`); }
  else await q(`INSERT INTO creator_profiles (slug, channel_id, name, editorial_bio, trigger_specialties, style_tags, signature_videos, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', datetime('now'), datetime('now'))`,
    [slug, ch.channel_id, ch.channel_name, bio.editorial_bio, JSON.stringify(bio.trigger_specialties), JSON.stringify(bio.style_tags), JSON.stringify(bio.signature_videos)]);
  published.push(slug);
  // Written per insert (last value wins), so a crash later in the run still builds and deploys what reached D1.
  if (process.env.GITHUB_OUTPUT && !DRY) appendFileSync(process.env.GITHUB_OUTPUT, `published=${published.length}\nslugs=${published.join(',')}\n`);
}
console.log(`published ${published.length} | skipped ${Object.keys(skipped).length} | attempts ${attempts} | pool left ${pool.length - attempts}`);
if (!DRY) {
  // Quality rejections stay rejected, so we never pay for them twice. A DeepSeek outage is not remembered.
  for (const [id, why] of Object.entries(skipped)) if (!/DeepSeek/.test(why)) state.skipped[id] = why;
  state.runs.push({ at: new Date().toISOString(), published, skipped: Object.values(skipped) });
  state.runs = state.runs.slice(-60);
  writeFileSync(STATE, JSON.stringify(state, null, 1));
}
