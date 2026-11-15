#!/usr/bin/env node
// Rolling-retention prune for Cloudflare Pages deployments.
// Keeps the newest N production deployments (rollback window) and newest M
// preview deployments per project; deletes the rest. Reusable across every
// Pages project on the account (homecodeguide, fridgecalc, future nichecalc).
//
// Housekeeping, not a defense: stops obsolete builds lingering at crawlable
// *.pages.dev hash URLs and bounds deployment clutter from frequent drip deploys.
//
// Usage:
//   node tools/cf-prune-deployments.mjs                 # prune all projects (live)
//   node tools/cf-prune-deployments.mjs --dry-run       # show what would be deleted
//   node tools/cf-prune-deployments.mjs fridgecalc home...   # only named projects
//   node tools/cf-prune-deployments.mjs --keep-prod=10 --keep-preview=3
//
// Token: reads CLOUDFLARE_API_TOKEN from env; falls back to ./muniengine/.env then ./.env.
// Account id: CLOUDFLARE_ACCOUNT_ID env, else the known account constant below.

import { readFileSync } from 'node:fs';

const DEFAULT_ACCOUNT = '175119c9cdd3c5d253a685ce56080b8c'; // not secret (appears in dashboard URLs)

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const KEEP_PROD = num(flag('--keep-prod'), 10);
const KEEP_PREVIEW = num(flag('--keep-preview'), 3);
const onlyProjects = args.filter((a) => !a.startsWith('--'));

function flag(name) {
  const a = args.find((x) => x.startsWith(name + '='));
  return a ? a.split('=')[1] : undefined;
}
function num(v, d) {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

function loadToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN.trim();
  for (const p of ['muniengine/.env', '.env', '../muniengine/.env']) {
    try {
      const m = readFileSync(p, 'utf8').match(/^CLOUDFLARE_API_TOKEN=(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch {}
  }
  return null;
}

const TOKEN = loadToken();
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || DEFAULT_ACCOUNT;
if (!TOKEN) {
  console.error('No CLOUDFLARE_API_TOKEN found (env or muniengine/.env). Aborting.');
  process.exit(1);
}
const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/pages/projects`;
const H = { Authorization: `Bearer ${TOKEN}` };

async function cf(url, method = 'GET') {
  for (let t = 0; t < 4; t++) {
    const r = await fetch(url, { method, headers: H });
    if (r.status === 429 || r.status >= 500) {
      await sleep(1500);
      continue;
    }
    let body = {};
    try {
      body = await r.json();
    } catch {}
    return { status: r.status, body };
  }
  return { status: 0, body: {} };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listProjects() {
  // The projects-list endpoint does NOT accept page/per_page params (returns
  // error 8000024); it returns all projects in one call.
  const { status, body } = await cf(BASE);
  if (status !== 200) {
    console.error(`! list projects -> HTTP ${status} ${JSON.stringify(body.errors || '')}`);
    return [];
  }
  return (body.result || []).map((p) => p.name);
}

async function listDeployments(project) {
  const out = [];
  let page = 1,
    pages = 1;
  do {
    const { status, body } = await cf(`${BASE}/${project}/deployments?per_page=25&page=${page}`);
    if (status !== 200) {
      console.error(`  ! list ${project} page ${page} -> HTTP ${status}`);
      break;
    }
    for (const d of body.result || [])
      out.push({
        id: d.id,
        env: d.environment, // 'production' | 'preview'
        created: d.created_on,
      });
    pages = body.result_info?.total_pages || 1;
    page++;
  } while (page <= pages);
  return out;
}

async function pruneProject(project) {
  const deps = await listDeployments(project);
  const prod = deps.filter((d) => d.env === 'production').sort(byNewest);
  const prev = deps.filter((d) => d.env !== 'production').sort(byNewest);
  const del = [...prod.slice(KEEP_PROD), ...prev.slice(KEEP_PREVIEW)];
  console.log(
    `\n=== ${project}: ${deps.length} total (prod ${prod.length}, preview ${prev.length}) | keep prod ${KEEP_PROD}, preview ${KEEP_PREVIEW} | ${DRY ? 'WOULD delete' : 'deleting'} ${del.length} ===`
  );
  let ok = 0,
    fail = 0;
  for (const d of del) {
    if (DRY) {
      ok++;
      continue;
    }
    const { status, body } = await cf(`${BASE}/${project}/deployments/${d.id}?force=true`, 'DELETE');
    if (status === 200 && body.success) ok++;
    else {
      fail++;
      if (fail <= 3) console.error(`  ! ${d.id.slice(0, 8)} -> ${status} ${JSON.stringify(body.errors || '')}`);
    }
  }
  console.log(`  -> ${DRY ? 'would delete' : 'deleted'} ${ok}, failed ${fail}`);
}
const byNewest = (a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0);

const projects = onlyProjects.length ? onlyProjects : await listProjects();
console.log(`Account ${ACCOUNT} | projects: ${projects.join(', ')}${DRY ? ' | DRY-RUN' : ''}`);
for (const p of projects) await pruneProject(p);
