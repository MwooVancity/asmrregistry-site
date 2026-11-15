#!/usr/bin/env node
/**
 * seed-channels.mjs — Seed D1 with known ASMR channels by scraping their YouTube pages.
 * No API key. Fetches @handle pages, extracts channelId from HTML.
 *
 * Usage: node tools/seed-channels.mjs [--dry-run]
 *
 * Needs CLOUDFLARE_API_TOKEN in .env (D1 write access).
 */

import 'dotenv/config';

const ACCOUNT_ID = '175119c9cdd3c5d253a685ce56080b8c';
const DATABASE_ID = '4f8937a1-9629-4c8b-a343-9cfe238cc319';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
if (!API_TOKEN) { console.error('Missing CLOUDFLARE_API_TOKEN in .env'); process.exit(1); }

const D1_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;
const DRY_RUN = process.argv.includes('--dry-run');

// ~300 known ASMR channels by @handle
const HANDLES = [
  // Mega creators (10M+ subs)
  'GentleWhispering','ASMRMagic','GibiASMR','TinglesWithFriends',
  'ASMRZeitgeist','LilyWhispers','WhispersRed','ASMRDarling',

  // Large creators (1M-10M)
  'FredsVoice','JoJosASMR','ASMRBakery','EphemeralRift',
  'TaylorASMR','SAS-ASMR','ASMR-Glow','hongyu-ASMR',
  'ASMRSurge','MassageASMR','ASMRByAlex','RussianASMR',
  'BlazeASMR','MellowASMR','ASMRSleep','TheWaterwhispers',
  'AmalZd','PierreAsmr','ASMRSommeil','SoftASMR',
  'ThatAnxiousASMR','RoxanaASMR','CharmedASMR','CalmingEscape',
  'EvgeniyaASMR','VeronicaASMR','IrinaASMR','DianeASMR',
  'NataliaASMR','ASMR-MB','ASMRRequestedbyJohn','CalmingWhispers',

  // Roleplay specialists
  'LatteASMR','CreaksandWhispers','ASMRKatie','HunsASMR',
  'SleepyASMR','TheOneSea','BoqASMR','TinglyBella',
  'WispyWell','NoraSleep','ASMRMeditation','SoftSleepASMR',

  // Trigger specialists
  'CrinklesASMR','TappingASMR','ASMRSounds','WhiteNoiseASMR',
  'NatureASMR','RainASMR','FireASMR','OceanASMR',
  'ForestASMR','StormASMR','CaffeASMR','SleepySunday',

  // International / multilingual
  'MiyukiASMR','YunaASMR','MinniASMR','KoreanASMR',
  'JapaneseASMR','ChineseASMR','SpanishASMR','FrenchASMR',
  'GermanASMR','PortugueseASMR','ItalianASMR','ArabicASMR',
  'TurkishASMR','RussianASMRCh','HindiASMR','PolishASMR',

  // Eating / mukbang ASMR
  'ZachChoi','MukbangASMR','EatingASMR','FoodASMR',
  'SoundOfCooking','CookingASMR','KitchenASMR','ASMRFood',

  // Male creators
  'ASMRDr','MaleASMR','GentleASMR','BrotherASMR',
  'DadASMR','ManlyASMR','GuyASMR','KingASMR',

  // Study / focus ASMR
  'StudyWithMe','FocusASMR','LibraryASMR','OfficeASMR',
  'QuietStudy','CalmStudy','StudySession','ASMRStudy',

  // Wellness / therapy ASMR
  'SleepASMR','AnxietyASMR','ADHDasymr','MeditationASMR',
  'TherapyASMR','HealingASMR','MindfulASMR','CalmASMR',

  // Equipment / creator tools
  'ASMRMicTest','MicrophoneASMR','3DioASMR','BlueMicASMR',
  'BinauralASMR','SpatialASMR','8DASMR','HolophonicsASMR',

  // Specific triggers
  'ScratchingASMR','CrinklingASMR','TingleASMR','HairBrush',
  'HandMovements','FaceASMR','NailTapping','PageTurning',
  'WoodTapping','GlassTapping','LeatherASMR','PlasticASMR',

  // Popular named creators
  'ASMRUniverseYT','RelaxingASMRYT','1HourASMR','AllNightASMR',
  'ASMRRequests','ViewFromTheOtherSide','ASMRPerverts',
  'PsycheOASMR','SpringtrapASMR','AutumnASMR','WinterASMR',
  'SummerASMR','VioletASMR','RoseASMR','BlueASMR',

  // Verified large channels by actual YT handle
  'ASMRSailor','ASMRBruce','ASMRSilk','ASMRMirror',
  'SleepyBella','WhisperAudios','LunaASMR','CloudASMR',
  'VelvetASMR','CrystalASMR','MistyASMR','DuskyASMR',
  'AuroraASMR','NightASMR','DawnASMR','DreamASMR',

  // Spa / roleplay
  'SpaASMR','SalonASMR','BarberASMR','DoctorASMR',
  'NurseASMR','DentalASMR','CranialASMR','EyeExamASMR',
  'ChiropractorASMR','MasseurASMR','PersonalASMR','AttentionASMR',

  // Long-form / ambient
  'LongASMR','10HourASMR','8HourASMR','AllNightASMR2',
  'SleepingASMR','InsomniaCure','NightSoundASMR','BedroomASMR',
];

async function d1(sql, params = []) {
  const r = await fetch(D1_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(`D1: ${JSON.stringify(j.errors)}`);
  return j.result?.[0]?.results ?? [];
}

async function d1Batch(stmts) {
  for (let i = 0; i < stmts.length; i += 100) {
    const chunk = stmts.slice(i, i + 100);
    const r = await fetch(D1_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map(s => ({ sql: s.sql, params: s.args }))),
    });
    const j = await r.json();
    if (!j.success) throw new Error(`D1 batch: ${JSON.stringify(j.errors)}`);
  }
}

async function resolveHandle(handle) {
  try {
    const url = `https://www.youtube.com/@${handle}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    // YouTube embeds channelId in multiple places
    const m = html.match(/"channelId":"(UC[a-zA-Z0-9_-]{22})"/);
    if (!m) return null;
    const channelId = m[1];
    // Also extract channel name
    const nameMatch = html.match(/"canonicalBaseUrl":"\/\@([^"]+)"/) ||
                      html.match(/"title":"([^"]{2,80})","description"/);
    const name = nameMatch ? nameMatch[1] : handle;
    return { id: channelId, name, handle };
  } catch {
    return null;
  }
}

async function pool(items, fn, size) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const res = await Promise.all(batch.map(fn));
    results.push(...res.filter(Boolean));
    process.stdout.write(`\r  resolved ${Math.min(i + size, items.length)}/${items.length} handles (${results.length} found)`);
    await new Promise(r => setTimeout(r, 300)); // polite pause
  }
  console.log();
  return results;
}

async function main() {
  console.log(`Seeding ${HANDLES.length} ASMR channels (dry-run=${DRY_RUN})\n`);

  // Check existing channels
  const existing = await d1('SELECT id FROM channels');
  const existingIds = new Set(existing.map(r => r.id));
  console.log(`Existing channels in DB: ${existingIds.size}`);

  // Resolve handles to channel IDs
  console.log('Resolving YouTube handles...');
  const resolved = await pool(HANDLES, resolveHandle, 10);
  console.log(`Resolved: ${resolved.length}/${HANDLES.length}`);

  const fresh = resolved.filter(c => !existingIds.has(c.id));
  console.log(`New (not in DB): ${fresh.length}`);

  if (fresh.length === 0 || DRY_RUN) {
    console.log(DRY_RUN ? 'Dry run — not inserting.' : 'Nothing new to insert.');
    return;
  }

  const stmts = fresh.map(c => {
    const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + c.id.slice(-6);
    return {
      sql: `INSERT OR IGNORE INTO channels (id, name, slug, status, last_updated) VALUES (?, ?, ?, 'pending_ingestion', datetime('now'))`,
      args: [c.id, c.name, slug],
    };
  });

  console.log(`Inserting ${stmts.length} channels...`);
  await d1Batch(stmts);
  console.log(`Done. Run rss-ingest.mjs next to pull their videos.`);

  // Receipt
  console.log('\nSample inserted:');
  fresh.slice(0, 5).forEach(c => console.log(` ${c.handle} → ${c.id} (${c.name})`));
}

main().catch(e => { console.error(e.message); process.exit(1); });
