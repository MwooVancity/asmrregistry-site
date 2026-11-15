// gsc-auth.mjs — shared GSC service-account auth (extracted from
// submit-sitemap-gsc.mjs so gsc-weekly.mjs reuses the same JWT flow).
// Requires GSC_SERVICE_ACCOUNT_JSON in .env; the service account must be a
// Full/Owner user on the GSC property.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createSign } from 'node:crypto';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Load .env — check repo root first, then velocity-engine/ (asmrregistry stores GSC creds there)
const dotenvPath = existsSync(join(REPO_ROOT, '.env'))
  ? join(REPO_ROOT, '.env')
  : join(REPO_ROOT, 'velocity-engine', '.env');
if (existsSync(dotenvPath)) {
  for (const line of readFileSync(dotenvPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

const FETCH_TIMEOUT_MS = 15000;

export async function timedFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { redirect: 'follow', ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function getCreds() {
  const gscJson = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!gscJson) throw new Error('GSC_SERVICE_ACCOUNT_JSON not set (check .env)');
  return JSON.parse(gscJson);
}

export async function getGSCAccessToken(creds = getCreds()) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  ).toString('base64url');
  const input = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  const sig = signer.sign(creds.private_key, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${input}.${sig}`;
  const res = await timedFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data).slice(0, 300)}`);
  return data.access_token;
}
