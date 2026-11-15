#!/usr/bin/env node
// tools/auto-triage.mjs — Automated P0–P4 detection + auto-fix.
//
// Runs as predeploy gate AND daily cron stage.
// Auto-fixes what's safe, blocks deploy on what's not.
//
//   node tools/auto-triage.mjs              # full run with auto-fix
//   node tools/auto-triage.mjs --dry-run    # detect only, no changes
//   node tools/auto-triage.mjs --cron       # cron mode (no exit(1), logs only)
//
// Exit 0 = PASS, Exit 1 = BLOCKER found

import 'dotenv/config';
import { readFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const CRON = process.argv.includes('--cron');
const SITE = 'https://asmrregistry.com';

const results = [];
function BLOCKER(check, msg) { results.push({ level: 'BLOCKER', check, msg }); }
function WARNING(check, msg) { results.push({ level: 'WARNING', check, msg }); }
function NOTE(check, msg)    { results.push({ level: 'NOTE', check, msg }); }
function FIXED(check, msg)   { results.push({ level: 'FIXED', check, msg }); }

const D1_ACCOUNT_ID = '175119c9cdd3c5d253a685ce56080b8c';
const D1_DATABASE_ID = '4f8937a1-9629-4c8b-a343-9cfe238cc319';
const D1_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
const D1_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

async function d1Execute(query) {
  const sql = typeof query === 'string' ? query : query.sql;
  const params = typeof query === 'string' ? [] : (query.args ?? []);
  const resp = await fetch(D1_BASE_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${D1_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const json = await resp.json();
  if (!json.success) throw new Error(`D1 query failed: ${JSON.stringify(json.errors)}`);
  const result = json.result?.[0] ?? { results: [] };
  return { rows: result.results ?? [], columns: result.results?.length ? Object.keys(result.results[0]) : [], rowsAffected: result.meta?.changes ?? 0 };
}

function getDb() {
  if (!D1_API_TOKEN) return null;
  return { execute: d1Execute };
}

async function fetchUrl(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'asmrregistry-auto-triage/1.0' },
    });
    return { ok: true, status: res.status, body: await res.text().catch(() => '') };
  } catch (e) {
    return { ok: false, status: 0, error: e.message, body: '' };
  } finally {
    clearTimeout(t);
  }
}

// ═══════════════════════════════════════════════════════════════════
// P0: Conflicting robots.txt
// ═══════════════════════════════════════════════════════════════════
async function check_robots_conflict() {
  const staticPath = join(ROOT, 'public', 'robots.txt');
  const dynamicPath = join(ROOT, 'src', 'pages', 'robots.txt.ts');
  const hasStatic = existsSync(staticPath);
  const hasDynamic = existsSync(dynamicPath);

  if (hasStatic && hasDynamic) {
    if (!DRY_RUN) {
      unlinkSync(staticPath);
      FIXED('robots-conflict', 'Deleted static public/robots.txt — dynamic version is canonical');
    } else {
      BLOCKER('robots-conflict', 'Both public/robots.txt and src/pages/robots.txt.ts exist');
    }
    return;
  }
  NOTE('robots-conflict', 'Single robots.txt source — OK');
}

// ═══════════════════════════════════════════════════════════════════
// P0: Sitemap URLs returning non-200 on live site
// ═══════════════════════════════════════════════════════════════════
async function check_sitemap_live() {
  const sitemapRes = await fetchUrl(`${SITE}/sitemap.xml`);
  if (!sitemapRes.ok || sitemapRes.status !== 200) {
    WARNING('sitemap-live', `Sitemap fetch failed: ${sitemapRes.status || sitemapRes.error}`);
    return;
  }

  // Extract child sitemap URLs
  const childMatches = sitemapRes.body.matchAll(/<loc>([^<]+)<\/loc>/g);
  const childUrls = [...childMatches].map(m => m[1]).filter(u => u.includes('sitemap'));

  const allPageUrls = [];
  for (const childUrl of childUrls) {
    const childRes = await fetchUrl(childUrl);
    if (!childRes.ok || childRes.status !== 200) {
      WARNING('sitemap-live', `Child sitemap ${childUrl} returned ${childRes.status}`);
      continue;
    }
    const pageMatches = childRes.body.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of [...pageMatches]) {
      if (!m[1].includes('sitemap')) allPageUrls.push(m[1]);
    }
  }

  // Also grab URLs from main sitemap if it's a urlset (not sitemapindex)
  if (allPageUrls.length === 0) {
    const pageMatches = sitemapRes.body.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of [...pageMatches]) {
      if (!m[1].includes('sitemap')) allPageUrls.push(m[1]);
    }
  }

  if (allPageUrls.length === 0) {
    WARNING('sitemap-live', 'No page URLs found in sitemap');
    return;
  }

  // Sample up to 15 URLs
  const sample = allPageUrls.sort(() => Math.random() - 0.5).slice(0, 15);
  let failures = 0;

  for (const url of sample) {
    const res = await fetchUrl(url);
    if (!res.ok || res.status !== 200) {
      BLOCKER('sitemap-live', `${url} returned ${res.status || res.error}`);
      failures++;
    }
  }

  if (failures === 0) {
    NOTE('sitemap-live', `Sampled ${sample.length}/${allPageUrls.length} sitemap URLs — all 200`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// P1: Dedup rate approaching kill-switch
// ═══════════════════════════════════════════════════════════════════
async function check_dedup_rate() {
  const db = getDb();
  if (!db) { WARNING('dedup-rate', 'No DB connection — skipping'); return; }

  const pubRes = await db.execute(`SELECT id, title, channel_id, view_count FROM videos WHERE status = 'published' ORDER BY id`);
  const videos = pubRes.rows;

  // Same-channel Levenshtein title similarity check
  function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(b.length + 1).fill(0).map(() => Array(a.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
      }
    }
    return matrix[b.length][a.length];
  }

  let dupPairs = 0;
  for (let i = 0; i < videos.length; i++) {
    for (let j = i + 1; j < videos.length; j++) {
      const a = videos[i], b = videos[j];
      if (a.channel_id !== b.channel_id) continue;
      const titleA = (a.title || '').toLowerCase();
      const titleB = (b.title || '').toLowerCase();
      const maxLen = Math.max(titleA.length, titleB.length);
      if (maxLen === 0) continue;
      const similarity = 1 - levenshtein(titleA, titleB) / maxLen;
      if (similarity > 0.95) dupPairs++;
    }
  }

  const rate = videos.length > 0 ? dupPairs / videos.length : 0;

  if (rate > 0.15) {
    BLOCKER('dedup-rate', `${dupPairs} duplicate pairs = ${(rate * 100).toFixed(1)}% — above 15% kill-switch`);
  } else if (rate > 0.10) {
    WARNING('dedup-rate', `${dupPairs} duplicate pairs = ${(rate * 100).toFixed(1)}% — approaching 15% kill-switch`);
  } else {
    NOTE('dedup-rate', `${dupPairs} duplicate pairs = ${(rate * 100).toFixed(1)}% — healthy`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// P2: Schema drift detection
// ═══════════════════════════════════════════════════════════════════
async function check_schema_drift() {
  const db = getDb();
  if (!db) { WARNING('schema-drift', 'No DB connection — skipping'); return; }

  const schemaPath = join(ROOT, 'src', 'lib', 'schema.sql');
  if (!existsSync(schemaPath)) { WARNING('schema-drift', 'schema.sql not found'); return; }
  const schemaSql = readFileSync(schemaPath, 'utf-8');

  // Extract column names from schema.sql CREATE TABLE videos
  const videosMatch = schemaSql.match(/CREATE TABLE IF NOT EXISTS videos\s*\(([\s\S]*?)\);/);
  if (!videosMatch) { WARNING('schema-drift', 'Could not parse videos table from schema.sql'); return; }

  const schemaColumns = new Set(
    videosMatch[1].split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('--') && !l.startsWith('UNIQUE') && !l.startsWith('FOREIGN') && !l.startsWith('CHECK'))
      .map(l => l.split(/\s+/)[0])
      .filter(Boolean)
  );

  // Get actual production columns
  const pragmaRes = await db.execute('PRAGMA table_info(videos)');
  const prodColumns = new Set(pragmaRes.rows.map(r => r.name));

  const missingInSchema = [...prodColumns].filter(c => !schemaColumns.has(c));
  const missingInProd = [...schemaColumns].filter(c => !prodColumns.has(c));

  if (missingInSchema.length > 0) {
    WARNING('schema-drift', `Production has columns not in schema.sql: ${missingInSchema.join(', ')}`);
  }
  if (missingInProd.length > 0) {
    WARNING('schema-drift', `schema.sql has columns not in production: ${missingInProd.join(', ')}`);
  }
  if (missingInSchema.length === 0 && missingInProd.length === 0) {
    NOTE('schema-drift', 'schema.sql matches production — no drift');
  }
}

// ═══════════════════════════════════════════════════════════════════
// P2: Tool health — verify all tools/*.ts compile
// ═══════════════════════════════════════════════════════════════════
async function check_tool_health() {
  const toolsDir = join(ROOT, 'tools');
  if (!existsSync(toolsDir)) { NOTE('tool-health', 'No tools/ directory'); return; }

  const tsFiles = readdirSync(toolsDir).filter(f => f.endsWith('.ts'));
  if (tsFiles.length === 0) { NOTE('tool-health', 'No .ts tools found'); return; }

  let failures = 0;
  for (const file of tsFiles) {
    try {
      const { execSync } = await import('child_process');
      execSync(`npx tsx --eval "import('./${file}')" 2>&1`, {
        cwd: toolsDir,
        timeout: 10000,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (e) {
      // Only flag import/syntax errors, not runtime errors
      const msg = (e.stderr || e.stdout || e.message || '').toString();
      if (msg.includes('Cannot find module') || msg.includes('SyntaxError') || msg.includes('is not defined')) {
        WARNING('tool-health', `tools/${file}: ${msg.split('\n')[0].substring(0, 120)}`);
        failures++;
      }
    }
  }

  if (failures === 0) {
    NOTE('tool-health', `${tsFiles.length} tool files — all parseable`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// P1: Thin creator pages in sitemap without noindex
// ═══════════════════════════════════════════════════════════════════
async function check_thin_creators() {
  const db = getDb();
  if (!db) { WARNING('thin-creators', 'No DB connection — skipping'); return; }

  const res = await db.execute(
    `SELECT slug, length(editorial_bio) as bio_len FROM creator_profiles WHERE status = 'published'`
  );

  const thin = res.rows.filter(r => Number(r.bio_len ?? 0) < 1500);
  if (thin.length > 0) {
    NOTE('thin-creators', `${thin.length} creator profiles under 1500 chars — runtime noindex gate active`);
  } else {
    NOTE('thin-creators', 'All published creators have adequate content');
  }
}

// ═══════════════════════════════════════════════════════════════════
// P3: Homepage word count
// ═══════════════════════════════════════════════════════════════════
async function check_homepage_content() {
  const res = await fetchUrl(`${SITE}/`);
  if (!res.ok || res.status !== 200) {
    WARNING('homepage-content', `Homepage returned ${res.status || res.error}`);
    return;
  }

  // Strip HTML tags, count words
  const text = res.body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = text.split(/\s+/).filter(w => w.length > 1).length;

  if (wordCount < 200) {
    WARNING('homepage-content', `Homepage has ~${wordCount} words — thin content risk`);
  } else {
    NOTE('homepage-content', `Homepage has ~${wordCount} words — adequate`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// P4: Key route health — verify critical pages return 200
// ═══════════════════════════════════════════════════════════════════
async function check_critical_routes() {
  const routes = ['/', '/search/', '/triggers/', '/about/', '/methodology/', '/sitemap.xml', '/robots.txt'];
  let failures = 0;

  for (const route of routes) {
    const res = await fetchUrl(`${SITE}${route}`);
    if (!res.ok || res.status !== 200) {
      BLOCKER('critical-routes', `${route} returned ${res.status || res.error}`);
      failures++;
    }
  }

  if (failures === 0) {
    NOTE('critical-routes', `${routes.length} critical routes — all 200`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// P1: Published videos with missing required fields
// ═══════════════════════════════════════════════════════════════════
async function check_video_completeness() {
  const db = getDb();
  if (!db) { WARNING('video-completeness', 'No DB connection — skipping'); return; }

  const res = await db.execute(`
    SELECT id, title, primary_trigger, triggers, intents, channel_name, why_watch
    FROM videos WHERE status = 'published'
  `);

  let issues = 0;
  const missing = { title: 0, primary_trigger: 0, triggers: 0, intents: 0, channel_name: 0, why_watch: 0 };

  for (const v of res.rows) {
    if (!v.title) missing.title++;
    if (!v.primary_trigger) missing.primary_trigger++;
    if (!v.triggers || v.triggers === '[]') missing.triggers++;
    if (!v.intents || v.intents === '[]') missing.intents++;
    if (!v.channel_name) missing.channel_name++;
    if (!v.why_watch) missing.why_watch++;
  }

  for (const [field, count] of Object.entries(missing)) {
    if (count > 0) {
      const level = ['title', 'primary_trigger'].includes(field) ? 'BLOCKER' : 'WARNING';
      if (level === 'BLOCKER') BLOCKER('video-completeness', `${count} published videos missing ${field}`);
      else WARNING('video-completeness', `${count} published videos missing ${field}`);
      issues++;
    }
  }

  if (issues === 0) {
    NOTE('video-completeness', `${res.rows.length} published videos — all fields complete`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  AUTO-TRIAGE — asmrregistry.com — ${new Date().toISOString()}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : CRON ? 'CRON' : 'PREDEPLOY'}`);
  console.log(`${'═'.repeat(72)}\n`);

  // Run all checks
  await check_robots_conflict();
  await check_critical_routes();
  await check_sitemap_live();
  await check_dedup_rate();
  await check_video_completeness();
  await check_thin_creators();
  await check_schema_drift();
  await check_homepage_content();
  // tool-health is slow, only run in non-cron mode
  if (!CRON) await check_tool_health();

  // Report
  const blockers = results.filter(r => r.level === 'BLOCKER');
  const warnings = results.filter(r => r.level === 'WARNING');
  const fixed    = results.filter(r => r.level === 'FIXED');
  const notes    = results.filter(r => r.level === 'NOTE');

  if (fixed.length > 0) {
    console.log(`AUTO-FIXED (${fixed.length}):`);
    fixed.forEach(r => console.log(`  ✓ [${r.check}] ${r.msg}`));
    console.log();
  }

  if (blockers.length > 0) {
    console.log(`BLOCKERS (${blockers.length}):`);
    blockers.forEach(r => console.log(`  ✗ [${r.check}] ${r.msg}`));
    console.log();
  }

  if (warnings.length > 0) {
    console.log(`WARNINGS (${warnings.length}):`);
    warnings.forEach(r => console.log(`  ⚠ [${r.check}] ${r.msg}`));
    console.log();
  }

  if (notes.length > 0) {
    console.log(`NOTES (${notes.length}):`);
    notes.forEach(r => console.log(`  · [${r.check}] ${r.msg}`));
    console.log();
  }

  console.log(`${'═'.repeat(72)}`);
  if (blockers.length > 0) {
    console.log(`  RESULT: ${blockers.length} BLOCKER(s) — deploy blocked`);
    console.log(`${'═'.repeat(72)}\n`);
    if (!CRON) process.exit(1);
  } else {
    console.log(`  RESULT: PASS — ${warnings.length} warning(s), ${fixed.length} auto-fixed`);
    console.log(`${'═'.repeat(72)}\n`);
  }
}

main().catch(err => {
  console.error('Auto-triage crashed:', err);
  if (!CRON) process.exit(1);
});
