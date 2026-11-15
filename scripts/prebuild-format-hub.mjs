#!/usr/bin/env node
// prebuild-format-hub.mjs — query D1 ONCE for top-30 videos, save to static JSON.
// FORMAT_HUB pages import this file instead of querying D1 per-request.
// Eliminates 49 × full-table-sort D1 reads from the daily rows_read budget.

import { execSync } from 'child_process'
import { writeFileSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// Load env
const envPath = join(root, '.env')
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('='); if (eq < 1 || line.startsWith('#')) continue
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\r$/, '')
    if (!(k in process.env)) process.env[k] = v
  }
} catch {}

const token = process.env.CLOUDFLARE_API_TOKEN
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const dbId = process.env.D1_DATABASE_ID

if (!token || !accountId || !dbId) {
  console.error('prebuild-format-hub: missing CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID / D1_DATABASE_ID — skipping')
  process.exit(0)
}

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `SELECT id, title, view_count, duration_seconds, primary_trigger, intensity
            FROM videos WHERE status = 'published' ORDER BY view_count DESC LIMIT 30`
    })
  }
)

const json = await res.json()
if (!json.success) {
  const { existsSync } = await import('fs')
  if (existsSync(out)) {
    console.warn('prebuild-format-hub: D1 query failed — using cached format-hub-videos.json from last build')
  } else {
    console.error('prebuild-format-hub: D1 query failed and no cache exists:', JSON.stringify(json.errors))
  }
  process.exit(0)
}

const rows = json.result?.[0]?.results ?? []
const out = join(root, 'src/lib/format-hub-videos.json')
writeFileSync(out, JSON.stringify(rows, null, 2))
console.log(`prebuild-format-hub: wrote ${rows.length} videos to src/lib/format-hub-videos.json`)
