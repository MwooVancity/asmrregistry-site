#!/usr/bin/env node
// prebuild-creators.mjs: bakes every published creator into src/lib/creators-data.json so creator pages, the
// /creators/ list and the sitemap need zero D1 reads at runtime. Costs ~1 row per catalog video of those creators,
// once per CI build (weekly) and at most once per 6 hours locally. Force with REFRESH_CREATORS=1.
// On any D1 failure the last good file is kept, never overwritten with less.
import { writeFileSync, readFileSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SUGGESTIVE, CLAIM, refreshBio } from './lib/creator-gate-lib.mjs'
import { decodeHtml, noTalk } from './lib/catalog-facts.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'src/lib/creators-data.json')
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const eq = line.indexOf('='); if (eq < 1 || line.startsWith('#')) continue
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\r$/, '')
    if (!(k in process.env)) process.env[k] = v
  }
} catch {}
if (!process.env.CI && !process.env.REFRESH_CREATORS && existsSync(OUT) && Date.now() - statSync(OUT).mtimeMs < 6 * 3600e3) {
  console.log('prebuild-creators: snapshot under 6h old, skipping D1 fetch'); process.exit(0)
}
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, D1_DATABASE_ID: dbId } = process.env
if (!token || !account || !dbId) { console.error('prebuild-creators: missing env vars, keeping last file'); process.exit(0) }

const query = async (sql, params = []) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${dbId}/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }),
  })
  const j = await r.json()
  if (!j.success) throw new Error(JSON.stringify(j.errors).slice(0, 200))
  return j.result?.[0]?.results ?? []
}

const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const arr = v => { try { return JSON.parse(v || '[]') } catch { return [] } }
const slim = v => ({ id: v.id, t: String(v.title).slice(0, 100), m: Math.round((v.duration_seconds || 0) / 60), v: v.view_count || 0 })

try {
  const profiles = await query(`SELECT slug, channel_id, name, editorial_bio, trigger_specialties, style_tags, signature_videos, updated_at FROM creator_profiles WHERE status = 'published' ORDER BY name`)
  if (!profiles.length) throw new Error('no profiles')
  const rows = []
  for (let i = 0; i < profiles.length; i += 20) {
    const ids = profiles.slice(i, i + 20).map(p => p.channel_id)
    rows.push(...await query(`SELECT channel_id, id, title, view_count, duration_seconds, primary_trigger, intents, modifiers, language, publish_date FROM videos INDEXED BY idx_videos_channel WHERE status = 'published' AND channel_id IN (${ids.map(() => '?').join(',')})`, ids))
  }
  for (const r of rows) r.title = decodeHtml(r.title)
  const by = {}; for (const r of rows) (by[r.channel_id] ||= []).push(r)

  const out = {}
  for (const p of profiles) {
    const all = by[p.channel_id] || []
    // Recommended lists skip Shorts and missing lengths, which read as "0 min".
    const v = all.filter(r => !SUGGESTIVE.test(r.title) && !CLAIM.test(r.title) && (r.duration_seconds || 0) >= 180).sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    const trig = {}; for (const r of all) if (r.primary_trigger && r.primary_trigger !== 'kisses') trig[r.primary_trigger] = (trig[r.primary_trigger] || 0) + 1
    // A channel whose titles are mostly treatment claims is marketing, not ASMR (a chiropractic clinic had a page).
    if (all.filter(r => CLAIM.test(r.title)).length >= all.length * 0.2) { console.warn(`prebuild-creators: no page for ${p.slug} (health-claim titles)`); continue }
    if (all.length < 15 || !v.length || !Object.keys(trig).length) { console.warn(`prebuild-creators: no page for ${p.slug} (${all.length} videos)`); continue }
    const mins = all.map(r => (r.duration_seconds || 0) / 60).filter(m => m > 0)
    const bucket = (a, b) => mins.filter(m => m >= a && m < b).length
    const has = (r, list, x) => arr(r[list]).includes(x)
    const byId = new Map(v.map(r => [r.id, r]))
    const dated = v.filter(r => r.publish_date).sort((a, b) => String(b.publish_date).localeCompare(String(a.publish_date)))
    const years = all.map(r => String(r.publish_date || '').slice(0, 4)).filter(y => /^\d{4}$/.test(y)).sort()
    out[p.slug] = {
      name: p.name, channelId: p.channel_id, bio: p.editorial_bio, updated: p.updated_at,
      specialties: arr(p.trigger_specialties), tags: arr(p.style_tags),
      count: all.length, medianMin: Math.round(med(mins)), firstYear: years[0] || null, lastYear: years[years.length - 1] || null,
      triggers: Object.entries(trig).sort((a, b) => b[1] - a[1]).slice(0, 8),
      lengths: [['Under 10 min', bucket(0, 10)], ['10 to 30 min', bucket(10, 30)], ['30 to 60 min', bucket(30, 60)], ['Over an hour', bucket(60, 1e9)]],
      noTalkingCount: all.filter(noTalk).length,
      titleNums: [...new Set(all.flatMap(r => String(r.title).match(/\d+(?:\.\d+)?/g) || []))].filter(n => n.length <= 4), // lets the truth gate verify "the 24 hour rain video"
      signature: arr(p.signature_videos).map(id => byId.get(id)).filter(Boolean).map(slim),
      top: v.slice(0, 9).map(slim),
      // One starting point per style: the most watched video of each of their three biggest triggers (30+ videos needed
      // before we call something a style). Popularity alone would show three videos of the same kind.
      styles: Object.entries(trig).sort((a, b) => b[1] - a[1]).filter(([, n]) => n >= 5).slice(0, 3)
        .map(([t, n]) => ({ trigger: t, n, video: v.find(r => r.primary_trigger === t) })).filter(s => s.video && all.length >= 30)
        .map(s => ({ trigger: s.trigger, n: s.n, ...slim(s.video) })),
      sleep: v.filter(r => has(r, 'intents', 'sleep') && r.duration_seconds >= 1200).slice(0, 5).map(slim),
      short: v.filter(r => r.duration_seconds > 0 && r.duration_seconds < 900).slice(0, 5).map(slim),
      noTalking: v.filter(noTalk).slice(0, 5).map(slim),
      newest: dated.slice(0, 5).map(r => ({ ...slim(r), d: String(r.publish_date).slice(0, 7) })),
      // Activity: uploads per year in our catalog (last 5 years) and the latest upload date we hold, for "still uploading?".
      lastUpload: all.map(r => String(r.publish_date || '').slice(0, 10)).filter(d => d.length === 10).sort().pop() || null,
      perYear: Object.entries(years.reduce((m, y) => ((m[y] = (m[y] || 0) + 1), m), {})).sort().slice(-5),
    }
  }
  // Similar creators: shared trigger mix, nudged by typical length, each with the reason in words. Matching is on our
  // title-based tags, not on how anyone sounds. No creator is suggested on more than MAX_SUGGESTED pages, so a few big
  // channels do not crowd out the rest. Pages with many mouth or eating tags also get "similar, few mouth sounds".
  const slugs = Object.keys(out)
  const MAX_SUGGESTED = 8
  const shown = {}
  const share = (c, t) => (c.triggers.find(([x]) => x === t)?.[1] || 0) / c.count
  const mouth = c => share(c, 'mouth-sounds') + share(c, 'eating-sounds')
  const label = t => t.replace(/-/g, ' ')
  const score = (a, b) => {
    let s = 0; for (const [t] of b.triggers) s += Math.min(share(a, t), share(b, t))
    return s - 0.15 * Math.abs(Math.log((a.medianMin || 1) / (b.medianMin || 1)))
  }
  const reason = (a, b) => {
    const both = a.triggers.map(([t]) => t).filter(t => share(a, t) >= 0.15 && share(b, t) >= 0.15).slice(0, 2)
    const len = Math.abs(a.medianMin - b.medianMin) <= 5 ? `similar length (${b.medianMin} min typical)` : `${b.medianMin > a.medianMin ? 'longer' : 'shorter'} videos (${b.medianMin} min typical)`
    return [both.length ? `both make a lot of ${both.map(label).join(' and ')}` : `overlapping triggers`, len].join(', ')
  }
  for (const s of slugs.sort((x, y) => out[y].count - out[x].count)) {
    const a = out[s]
    const ranked = slugs.filter(o => o !== s).map(o => [o, score(a, out[o])]).filter(x => x[1] > 0.15).sort((x, y) => y[1] - x[1])
    const pick = (filter, n) => ranked.filter(([o]) => filter(out[o]) && (shown[o] || 0) < MAX_SUGGESTED).slice(0, n)
      .map(([o]) => { shown[o] = (shown[o] || 0) + 1; return { slug: o, name: out[o].name, why: reason(a, out[o]) } })
    a.similar = pick(() => true, 4)
    a.similarQuiet = mouth(a) >= 0.2 ? pick(c => mouth(c) < 0.05 && !a.similar.some(x => out[x.slug] === c), 3) : []
  }
  if (existsSync(OUT)) {
    const prev = Object.keys(JSON.parse(readFileSync(OUT, 'utf8'))).length
    if (slugs.length < prev * 0.8) throw new Error(`only ${slugs.length} creators, last file has ${prev}`)
  }
  for (const s of slugs) out[s].bio = refreshBio(out[s].bio, out[s])
  // "Still uploading?" must not rest on our catalog, which misses new uploads: ask YouTube for each channel's latest
  // upload (uploads playlist, 1 quota unit each, ~184 a build). Refreshed every build, so well inside the 30-day rule.
  // A failed call leaves channelLatest unset and the page falls back to the catalog date.
  const ytKey = process.env.YOUTUBE_API_KEY
  if (ytKey) {
    let got = 0
    await Promise.all(slugs.map(async (s, i) => {
      const ch = out[s].channelId
      if (!/^UC[\w-]{22}$/.test(ch || '')) return
      await new Promise(r => setTimeout(r, i * 20))
      try {
        const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=1&playlistId=UU${ch.slice(2)}&key=${ytKey}`).then(r => r.json())
        const d = r.items?.[0]?.contentDetails?.videoPublishedAt
        if (d) { out[s].channelLatest = d.slice(0, 10); out[s].checked = new Date().toISOString().slice(0, 10); got++ }
      } catch {}
    }))
    console.log(`prebuild-creators: latest upload from YouTube for ${got} of ${slugs.length} channels`)
  }
  writeFileSync(OUT, JSON.stringify(out))
  console.log(`prebuild-creators: ${slugs.length} creators, ${rows.length} rows read, ${Math.round(JSON.stringify(out).length / 1024)} KB`)
} catch (e) {
  console.warn('prebuild-creators: keeping last file:', e.message)
  if (!existsSync(OUT)) process.exit(1)
}
