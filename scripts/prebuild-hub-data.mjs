#!/usr/bin/env node
// prebuild-hub-data.mjs — ONE D1 query at build time, zero runtime D1 reads for all hub pages.
//
// Replaces per-request D1 reads for:
//   - 70 TRIGGER_HUB pages  (50 vids + total count + triggerStats)
//   - 28 INTENT_HUB pages   (30 vids + total count + triggerStats)
//   - 49 FORMAT_HUB pages   (top-30 global)
//   - triggers-overview     (per-trigger counts)
//
// Output: src/lib/hub-data-all.json
// Imported by [slug].astro — bundled into Worker at build time.

import { writeFileSync, readFileSync, existsSync, statSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { SUGGESTIVE, CLAIM } from './lib/creator-gate-lib.mjs'
import { buildFacts, FOOD, FOOD_OK, decodeHtml, noTalk } from './lib/catalog-facts.mjs'

// One rule for every video we recommend (hub lists, finder): a real length (Shorts and missing lengths read as
// "0 min"), nothing suggestive, no health-claim titles. Counts use the same food filter as the catalog facts, so a
// page never shows two different totals for one trigger.
const pickable = v => (v.duration_seconds || 0) >= 180 && !SUGGESTIVE.test(v.title) && !CLAIM.test(v.title)
const clean = (slice, v) => !SUGGESTIVE.test(v.title) && (FOOD_OK.has(slice) || !FOOD.test(v.title))
const SLEEPY = new Set(['sleep', 'insomnia'])
const sleepPick = v => pickable(v) && v.duration_seconds >= 1800 && v.primary_trigger !== 'eating-sounds' && !FOOD.test(v.title)

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'src/lib/hub-data-all.json')

// Load env
const envPath = join(root, '.env')
try {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const eq = line.indexOf('='); if (eq < 1 || line.startsWith('#')) continue
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\r$/, '')
    if (!(k in process.env)) process.env[k] = v
  }
} catch {}

// Local builds reuse a snapshot under 6 hours old: each fetch reads ~43K rows and a busy day has a dozen builds.
// CI always fetches (fresh checkouts make the file look new). Force with REFRESH_HUB=1.
if (!process.env.CI && !process.env.REFRESH_HUB && existsSync(OUT) && Date.now() - statSync(OUT).mtimeMs < 6 * 3600e3) {
  console.log('prebuild-hub-data: snapshot under 6h old, skipping D1 fetch')
  process.exit(0)
}

const token = process.env.CLOUDFLARE_API_TOKEN
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const dbId = process.env.D1_DATABASE_ID

if (!token || !accountId || !dbId) {
  console.error('prebuild-hub-data: missing env vars — skipping')
  process.exit(0)
}

// ONE query: pull all published videos with intents field
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${dbId}/query`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `SELECT id, title, channel_name, view_count, duration_seconds, primary_trigger, intensity, intents, modifiers, format, roleplay_scenario, language, substr(publish_date, 1, 4) AS year
            FROM videos WHERE status = 'published' ORDER BY view_count DESC;
            SELECT primary_trigger, COUNT(*) AS n FROM videos WHERE status = 'deleted' GROUP BY primary_trigger`
    })
  }
)

const json = await res.json()
if (!json.success) {
  if (existsSync(OUT)) {
    console.warn('prebuild-hub-data: D1 query failed — using cached hub-data-all.json from last build')
  } else {
    console.error('prebuild-hub-data: D1 query failed and no cache exists:', JSON.stringify(json.errors))
  }
  process.exit(0)
}

const allVideos = json.result?.[0]?.results ?? []
console.log(`prebuild-hub-data: fetched ${allVideos.length} published videos`)
for (const v of allVideos) { v.title = decodeHtml(v.title); v.channel_name = decodeHtml(v.channel_name) }

// A short result must never replace a good file: hub pages would ship nearly empty.
if (existsSync(OUT)) {
  const prev = JSON.parse(readFileSync(OUT, 'utf8')).triggersOverview.reduce((n, t) => n + t.count, 0)
  const now = allVideos.filter(v => v.primary_trigger).length
  if (now < prev * 0.8) {
    console.warn(`prebuild-hub-data: only ${now} tagged videos, last file has ${prev}. Keeping last file.`)
    process.exit(0)
  }
}

// Slim video shape (drop intents — not needed on hub pages)
const slim = v => ({
  id: v.id,
  title: v.title,
  channel_name: v.channel_name,
  view_count: v.view_count,
  duration_seconds: v.duration_seconds,
  primary_trigger: v.primary_trigger,
  intensity: v.intensity,
})

// ── TRIGGER_HUB: top-50 per trigger, total count, triggerStats ──────────────
const triggerMap = {}
for (const v of allVideos) {
  if (!v.primary_trigger || !clean(v.primary_trigger, v) || !pickable(v)) continue
  if (!triggerMap[v.primary_trigger]) triggerMap[v.primary_trigger] = []
  if (triggerMap[v.primary_trigger].length < 100) triggerMap[v.primary_trigger].push(slim(v))
}

// Precompute total counts (not just top-50 slice)
const triggerCounts = {}
for (const v of allVideos) {
  if (v.primary_trigger && clean(v.primary_trigger, v)) triggerCounts[v.primary_trigger] = (triggerCounts[v.primary_trigger] || 0) + 1
}

const AMBIENT = new Set(['ocean', 'rain', 'fire', 'nature', 'water-sounds', 'white-noise'])
const MUSIC = /\b(music|musica|música|jazz|bossa|lo-?fi|piano|song|guitar|beats)\b/i
const triggerHubs = {}
for (const [trigger, vids] of Object.entries(triggerMap)) {
  // Videos whose title names the trigger go first, so the first pick on /tapping/ is plainly a tapping video.
  const word = trigger.split('-')[0].replace(/s$/, '').toLowerCase()
  // Ambient sounds are played long and without music: 30+ minutes and no music words (drops Bob Ross "Ocean
  // Sunset", 5-minute AI quiz clips and bossa nova ambience from /ocean/, 2026-11-10).
  const ambient = AMBIENT.has(trigger)
  const named = vids.filter(v => v.title.toLowerCase().includes(word) && (!ambient || ((v.duration_seconds || 0) >= 1800 && !MUSIC.test(v.title))))
  // 24 shown: titles that name the trigger first, then the rest. Tags come from titles and can be wrong
  // (a Spanish skincare roleplay tagged tapping), so a long list mostly adds mistakes.
  triggerHubs[trigger] = {
    // Only titles that name the trigger (2026-11-10: the /ocean/ filler held Bob Ross, scary games and Minecraft lo-fi).
    videos: named.slice(0, 24),
    totalVideoCount: triggerCounts[trigger] || vids.length,
  }
}

// ── /whispering/: whisper styles named in English titles (counts, median length, 3 most watched each) ──
const WHISPER_STYLES = [
  ['inaudible', 'Inaudible whispering', /\b(inaudible|unintelligible)\b/i],
  ['soft-spoken', 'Soft-spoken', /\bsoft[\s-]?spoken\b/i],
  ['ear-to-ear', 'Ear-to-ear', /\bear[\s-]to[\s-]ear\b/i],
]
const whisperVids = allVideos.filter(v => v.primary_trigger === 'whispering' && clean('whispering', v) && pickable(v))
const medMin = arr => { const s = arr.map(v => v.duration_seconds).sort((a, b) => a - b); return s.length ? Math.round(s[Math.floor(s.length / 2)] / 60) : 0 }
// Style picks skip videos the main /whispering/ list shows (2026-11-11: five appeared twice on the page).
const mainWhisper = new Set((triggerHubs.whispering?.videos ?? []).map(v => v.id))
const whisperStyles = WHISPER_STYLES.map(([key, label, re]) => {
  const m = whisperVids.filter(v => re.test(v.title))
  return { key, label, count: m.length, medianMin: m.length >= 30 ? medMin(m) : null, top: [...m].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).filter(v => !mainWhisper.has(v.id)).slice(0, 3).map(slim) }
})

// ── /guides/que-es-asmr/: Spanish-language videos (count, median, top triggers, 6 most watched) ──
// The language tag marks few Spanish videos (10 on 2026-11-10); titles saying "español" are the better signal.
const esAll = allVideos.filter(v => (v.language === 'es' || /\bespa(ñ|n)ol\b/i.test(v.title)) && v.primary_trigger && clean(v.primary_trigger, v))
const esTrig = {}
for (const v of esAll) esTrig[v.primary_trigger] = (esTrig[v.primary_trigger] || 0) + 1
const spanish = {
  count: esAll.length,
  channels: new Set(esAll.map(v => v.channel_name)).size,
  medianMin: esAll.length >= 30 ? medMin(esAll.filter(v => v.duration_seconds > 0)) : null,
  triggers: Object.entries(esTrig).sort((a, b) => b[1] - a[1]).slice(0, 5),
  top: esAll.filter(pickable).sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 6).map(slim),
}

// ── Trigger pages the tagger never uses as a main trigger (velcro, ice, thunderstorm...): match the page's word in
// titles instead, so the page can play real videos (2026-11-11: 39 pages had none). Generic words are skipped.
const TITLE_FALLBACK_SKIP = new Set(['tingles', 'relaxation', 'layered-sounds', 'triggers-overview', 'pouring', 'pouring-sounds']) // pouring: titles mean "pouring rain"
try {
  const led = JSON.parse(readFileSync(join(root, 'src/lib/asmr-keyword-ledger.json'), 'utf8'))
  const cands = []
  for (const p of led.pages.filter(p => p.pageType === 'TRIGGER_HUB' && !triggerHubs[p.slug] && !TITLE_FALLBACK_SKIP.has(p.slug))) {
    const phrase = p.slug.replace(/^asmr-|-asmr$|-sounds?$/g, '').replace(/-/g, ' ')
    // "-sounds" pages need "<word> sound" in the title: plain "ice" matched ice cream, "hand" matched Hand Tools.
    const re = /-sounds?$/.test(p.slug) ? new RegExp('\\b' + phrase + '\\w* sounds?\\b', 'i') : new RegExp('\\b' + phrase + '(s|es|ing)?\\b', 'i')
    const amb = /thunder|fire|wind|rain|water|ocean|storm/.test(phrase)
    const m = allVideos.filter(v => re.test(v.title) && pickable(v) && clean(p.slug, v) && (!amb || ((v.duration_seconds || 0) >= 1800 && !MUSIC.test(v.title))))
    cands.push([p.slug, phrase, m])
  }
  // A video is listed on one trigger page only (2026-11-11: thunder and thunderstorm shared 15 of 24, rain and
  // thunderstorm 11): tagged pages keep theirs, then title pages claim in order of size; under 6 left = no list.
  const used = new Set(Object.values(triggerHubs).flatMap(h => h.videos.map(v => v.id)))
  for (const [slug, phrase, m] of cands.sort((a, b) => b[2].length - a[2].length)) {
    const free = [...m].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).filter(v => !used.has(v.id)).slice(0, 24)
    if (free.length < 6) continue
    free.forEach(v => used.add(v.id))
    triggerHubs[slug] = { videos: free.map(slim), totalVideoCount: m.length, byTitle: true, phrase }
  }
} catch (e) { console.warn('prebuild-hub-data: title fallback skipped:', e.message) }

// ── /research/asmr-title-claims/: titles that promise an outcome, by trigger (paper 2, 2026-11-12) ─────────
// Promises only: cure/heal, a frequency in Hz, a percentage, "instantly", "miracle", "guaranteed". Not "therapy" or
// "treatment" (head-spa and massage-therapy titles are services, not claims). Condition words counted separately.
const PROMISE_RE = /\bcur(e|es|ed|ing)\b|\bheal(s|ing|ed)?\b|\b\d+(\.\d+)? ?hz\b|\b\d{2,3}(\.\d+)? ?%|\binstant(ly)?\b|\bmiracle\b|\bguarantee(d)?\b/i
const CONDITION_RE = /\b(anxiety|insomnia|depression|ptsd|tinnitus|migraines?|headaches?|adhd|panic attacks?|ocd)\b/i
// Not promises: monitor refresh rates ("390Hz Gameplay") and instant foods ("instant noodles", 2026-11-12 sample).
const NOT_PROMISE = /gameplay|monitor|\bfps\b|polling|instant (noodle|ramen|coffee|pot|camera)/i
// Words that promise on their own; Hz values and percentages only beside an outcome word ("390Hz gameplay" and
// French "100% ROSE" colour themes are not promises; "99.9% of you will sleep" and "4Hz theta for sleep" are).
const WORD_PROMISE = /\bcur(e|es|ed|ing)\b|\bheal(s|ing|ed)?\b|\binstant(ly)?\b|\bmiracle\b|\bguarantee(d)?\b/i
const NUM_PROMISE = /\b\d+(\.\d+)? ?hz\b|\b\d{2,3}(\.\d+)? ?%/i
const OUTCOME = /sleep|asleep|tingl|relax|brain|binaural|delta|theta|alpha|gamma|anxiety|insomnia|calm|stress/i
const isPromise = (t) => !!t && !NOT_PROMISE.test(t) && (WORD_PROMISE.test(t) || (NUM_PROMISE.test(t) && OUTCOME.test(t)))
const SAMPLE_GENRE = /\bof (you|u) will (sleep|fall asleep)/i
const claimByT = {}
for (const v of allVideos) {
  if (!v.primary_trigger || !v.title) continue
  const c = claimByT[v.primary_trigger] ||= { trigger: v.primary_trigger, n: 0, promise: 0, condition: 0, both: 0 }
  const p = isPromise(v.title), d = CONDITION_RE.test(v.title)
  c.n++; if (p) c.promise++; if (d) c.condition++; if (p && d) c.both++
}
const pc = (a, b) => Math.round((1000 * a) / b) / 10
const titleClaims = {
  total: allVideos.length,
  promise: allVideos.filter(v => isPromise(v.title)).length,
  willSleep: allVideos.filter(v => SAMPLE_GENRE.test(v.title || '')).length,
  condition: allVideos.filter(v => CONDITION_RE.test(v.title || '')).length,
  byTrigger: Object.values(claimByT).filter(c => c.n >= 300)
    .map(c => ({ ...c, promisePct: pc(c.promise, c.n), conditionPct: pc(c.condition, c.n) }))
    .sort((a, b) => b.promisePct - a.promisePct),
}
if (process.env.CLAIM_SAMPLE) for (const t of process.env.CLAIM_SAMPLE.split(',')) console.log(t, allVideos.filter(v => v.primary_trigger === t && isPromise(v.title)).slice(0, 8).map(v => v.title.slice(0, 70)))

// ── Length change by trigger (paper 3, 2026-11-12): median length of uploads in an early 3-year window against the
// latest 3 full years. 30+ timed videos in each window; the current, partial year never counts.
const lastFull = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }).slice(0, 4)) - 1
const EARLY = [lastFull - 7, lastFull - 5], LATE = [lastFull - 2, lastFull]
const inWin = (v, [a, b]) => Number(v.year) >= a && Number(v.year) <= b && (v.duration_seconds || 0) > 0
const lenByTrig = {}
for (const v of allVideos) if (v.primary_trigger && clean(v.primary_trigger, v)) (lenByTrig[v.primary_trigger] ||= []).push(v)
const lengthChange = {
  early: EARLY, late: LATE,
  rows: Object.entries(lenByTrig).map(([trigger, vs]) => {
    const e = vs.filter(v => inWin(v, EARLY)), l = vs.filter(v => inWin(v, LATE))
    if (e.length < 30 || l.length < 30) return null
    const em = medMin(e), lm = medMin(l)
    return { trigger, earlyN: e.length, earlyMed: em, lateN: l.length, lateMed: lm, changePct: em ? Math.round((100 * (lm - em)) / em) : null }
  }).filter(r => r && r.changePct != null).sort((a, b) => b.changePct - a.changePct),
}

// ── Language by trigger (paper 5, 2026-11-12): share of language-labelled videos in Korean, Japanese and English.
const langRows = Object.entries(lenByTrig).map(([trigger, vs]) => {
  const lab = vs.filter(v => v.language)
  if (lab.length < 30) return null
  const share = (code) => Math.round((1000 * lab.filter(v => v.language === code).length) / lab.length) / 10
  return { trigger, n: lab.length, ko: share('ko'), ja: share('ja'), en: share('en') }
}).filter(r => r && r.trigger !== 'kisses').sort((a, b) => (b.ko + b.ja) - (a.ko + a.ja))
const languageMap = { rows: langRows }

// ── triggers-overview: per-trigger counts sorted by count ───────────────────
const triggersOverview = Object.entries(triggerCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50)
  .map(([trigger, count]) => ({ trigger, count }))

// ── INTENT_HUB: top-30 per intent, total count, triggerStats ────────────────
// Load ledger to know which intent slugs exist
let intentSlugs = []
try {
  const ledger = JSON.parse(readFileSync(join(root, 'src/lib/asmr-keyword-ledger.json'), 'utf8'))
  intentSlugs = ledger.pages.filter(p => p.pageType === 'INTENT_HUB').map(p => p.slug)
} catch {}

const INTENT_TAGS = {
  'asmr-for-focus': ['study'], 'asmr-for-work': ['background'], 'asmr-for-insomnia': ['insomnia'],
  'asmr-for-adhd': ['adhd'], 'meditation-asmr': ['meditation'], 'asmr-for-stress': ['anxiety'],
  'asmr-for-depression': [], 'asmr-for-ptsd': [], 'asmr-for-tinnitus': [], 'asmr-for-panic-attacks': [],
}
const intentHubs = {}
for (const intent of intentSlugs) {
  // Page slugs and classifier tags differ ("asmr-for-focus" vs "study"). Health pages (depression, PTSD, tinnitus,
  // panic) keep no automatic list on purpose: title tags are too loose for them.
  const tags = INTENT_TAGS[intent] || [intent]
  const matched = allVideos.filter(v => {
    if (!v.intents) return false
    try {
      const arr = typeof v.intents === 'string' ? JSON.parse(v.intents) : v.intents
      return tags.some(t => Array.isArray(arr) ? arr.includes(t) : String(v.intents).includes(t))
    } catch { return tags.some(t => String(v.intents).includes(t)) }
  })
  const top30 = matched.filter(SLEEPY.has(intent) ? sleepPick : pickable).slice(0, 60).map(slim)
  // triggerStats from matched videos
  const trigMap = {}
  for (const v of matched) { if (v.primary_trigger) trigMap[v.primary_trigger] = (trigMap[v.primary_trigger] || 0) + 1 }
  const triggerStats = Object.entries(trigMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([trigger, count]) => ({ trigger, count }))
  intentHubs[intent] = {
    videos: top30,
    totalVideoCount: matched.filter(v => !SUGGESTIVE.test(v.title)).length,
    triggerStats,
  }
}

// ── FORMAT_HUB: global top-30 ────────────────────────────────────────────────
const formatHub = allVideos.filter(pickable).slice(0, 30).map(slim) // generic best-of lists: same safety rule as hubs

// ── /asmr-videos/ finder: full-catalog table, plus up to 100 clean videos per trigger as a static file
const isNoTalk = noTalk
const byTrig = {}
for (const v of allVideos) if (v.primary_trigger && clean(v.primary_trigger, v)) (byTrig[v.primary_trigger] ||= []).push(v)
const catalogStats = Object.entries(byTrig).filter(([t, a]) => t !== 'kisses' && a.length >= 30).sort((a, b) => b[1].length - a[1].length).map(([trigger, a]) => {
  const mins = a.map(v => (v.duration_seconds || 0) / 60).filter(m => m > 0).sort((x, y) => x - y)
  const pct = n => Math.round(100 * n / a.length)
  return { trigger, count: a.length, medianMin: Math.round(mins[Math.floor(mins.length / 2)] || 0), over30: pct(mins.filter(m => m >= 30).length), noTalking: pct(a.filter(isNoTalk).length) }
})
const finder = [], inFinder = new Set()
// Up to 100 per trigger, plus up to 60 per roleplay scenario so roleplay pages have enough to filter.
const byScenario = {}
for (const v of allVideos) if (v.roleplay_scenario && v.primary_trigger && clean(v.primary_trigger, v)) (byScenario[v.roleplay_scenario] ||= []).push(v)
const slices = [...Object.entries(byTrig).filter(([t]) => t !== 'kisses').map(([t, a]) => [a, 100]), ...Object.values(byScenario).map(a => [a, 60])]
for (const [a, cap] of slices) {
  for (const v of a.filter(pickable).filter(x => !inFinder.has(x.id)).slice(0, cap)) {
    inFinder.add(v.id)
    const t = v.primary_trigger
    // [8] goals the classifier tagged: s sleep, a anxiety, f study or focus, t tingles. [9] traits: f fast, m music.
    const it = String(v.intents)
    const goals = (/"(sleep|insomnia)"/.test(it) ? 's' : '') + (/"anxiety"/.test(it) ? 'a' : '') + (/"(study|background|adhd)"/.test(it) ? 'f' : '') + (/"tingles"/.test(it) ? 't' : '')
    const traits = (/fast|aggressive/i.test(String(v.modifiers) + ' ' + v.title) ? 'f' : '') + (/music|piano|lo-?fi/i.test(v.title) && !/no music/i.test(v.title) ? 'm' : '')
    finder.push([v.id, v.title.slice(0, 90), v.channel_name, v.view_count, Math.round((v.duration_seconds || 0) / 60), t, isNoTalk(v) ? 1 : 0, it.includes('sleep') ? 1 : 0, goals, traits, v.intensity || 0, v.roleplay_scenario || '', v.language || ''])
  }
}
finder.sort((a, b) => b[3] - a[3])
writeFileSync(join(root, 'public/finder-videos.json'), JSON.stringify(finder))

// ── Write output ─────────────────────────────────────────────────────────────
// Per-page facts. Creator links come from the last creator snapshot (built after this script).
let creatorSlugByName = {}
try { for (const [slug, c] of Object.entries(JSON.parse(readFileSync(join(root, 'src/lib/creators-data.json'), 'utf8')))) creatorSlugByName[c.name] = slug } catch {}
const facts = buildFacts(allVideos.filter(v => !SUGGESTIVE.test(v.title)), intentSlugs, creatorSlugByName)
console.log(`prebuild-hub-data: facts for ${Object.keys(facts).length} pages`)
if (process.env.FACTS_SAMPLE) for (const [k, f] of Object.entries(facts)) console.log(k, f.count, '|', f.samples.join(' || '))

// ── /guides/asmr-trends/: the catalog by upload year, and how many tracked videos YouTube has removed ──────────
// Years under 300 videos are left out (too few for a share), so are triggers outside the top 10.
const statSet = allVideos.filter(v => v.primary_trigger && v.primary_trigger !== 'kisses' && clean(v.primary_trigger, v))
const median = a => { const s = a.filter(x => x > 0).sort((x, y) => x - y); return s.length ? Math.round(s[Math.floor(s.length / 2)]) : 0 }
const byYear = {}
for (const v of statSet) if (/^\d{4}$/.test(v.year || '')) (byYear[v.year] ||= []).push(v)
const topTrig = catalogStats.slice(0, 10).map(s => s.trigger)
const trends = Object.entries(byYear).filter(([, a]) => a.length >= 300).sort(([a], [b]) => a.localeCompare(b)).map(([year, a]) => {
  const pct = n => Math.round(100 * n / a.length)
  return {
    year, count: a.length, medianMin: median(a.map(v => (v.duration_seconds || 0) / 60)),
    over60: pct(a.filter(v => v.duration_seconds >= 3600).length), noTalking: pct(a.filter(noTalk).length),
    korean: pct(a.filter(v => v.language === 'ko').length),
    triggers: Object.fromEntries(topTrig.map(t => [t, pct(a.filter(v => v.primary_trigger === t).length)])),
  }
})
// /best/best-sleep-headphones/: how long sleep-tagged videos run, to compare with battery life.
const sleepVids = allVideos.filter(v => /"sleep"/.test(String(v.intents)) && (v.duration_seconds || 0) >= 180)
const sleepLengths = { count: sleepVids.length, over: Object.fromEntries([1, 2, 4, 6, 8, 10, 14, 16, 24].map(h => [h, Math.round(100 * sleepVids.filter(v => v.duration_seconds >= h * 3600).length / Math.max(sleepVids.length, 1))])) }
const removedRows = json.result?.[1]?.results ?? []
const removed = { total: removedRows.reduce((n, r) => n + r.n, 0), tracked: allVideos.length + removedRows.reduce((n, r) => n + r.n, 0),
  byTrigger: removedRows.filter(r => r.primary_trigger && r.primary_trigger !== 'kisses').sort((a, b) => b.n - a.n).slice(0, 8).map(r => ({ trigger: r.primary_trigger, n: r.n })) }

const out = { languageMap, lengthChange, titleClaims, spanish, whisperStyles, triggerHubs, triggersOverview, intentHubs, formatHub, catalogStats, facts, trends, removed, sleepLengths, catalogCount: allVideos.length, catalogChannels: new Set(allVideos.map(v => v.channel_name)).size, catalogDate: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) } // Pacific date: a UTC date reads as tomorrow to US readers in the evening
writeFileSync(OUT, JSON.stringify(out))

// Static sitemaps for every published /video/ page (owner 2026-11-15: index them). Built here from the fetch
// already done, 45,000 per file: no per-request table scan (the old dynamic sitemap-videos.xml did one per fetch).
{
  const { readdirSync, unlinkSync } = await import('fs')
  for (const f of readdirSync(join(root, 'public')).filter(f => /^sitemap-videos-\d+\.xml$/.test(f))) unlinkSync(join(root, 'public', f))
  const ids = allVideos.filter(v => v.id && !SUGGESTIVE.test(v.title || '')).map(v => v.id)
  const files = []
  for (let i = 0; i < ids.length; i += 45000) {
    const name = `sitemap-videos-${files.length + 1}.xml`
    writeFileSync(join(root, 'public', name), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${ids.slice(i, i + 45000).map(id => `<url><loc>https://asmrregistry.com/video/${id}/</loc></url>`).join('\n')}\n</urlset>\n`)
    files.push(name)
  }
  const rp = join(root, 'public/robots.txt')
  const robots = readFileSync(rp, 'utf8').split(/\r?\n/).filter(l => l && !/sitemap-videos-\d+\.xml/.test(l))
  writeFileSync(rp, [...robots, ...files.map(f => `Sitemap: https://asmrregistry.com/${f}`), ''].join('\n'))
  console.log(`prebuild-hub-data: ${ids.length} video URLs in ${files.length} sitemap file(s)`)
}

const stats = {
  triggers: Object.keys(triggerHubs).length,
  intents: Object.keys(intentHubs).length,
  formatVideos: formatHub.length,
  totalVideos: allVideos.length,
}
console.log(`prebuild-hub-data: wrote hub-data-all.json — ${stats.triggers} triggers, ${stats.intents} intents, ${stats.formatVideos} format videos (from ${stats.totalVideos} total)`)

// ── Gate: verify all ledger TRIGGER_HUB slugs have data ─────────────────────
try {
  const ledger = JSON.parse(readFileSync(join(root, 'src/lib/asmr-keyword-ledger.json'), 'utf8'))
  const triggerPages = ledger.pages.filter(p => p.pageType === 'TRIGGER_HUB' && p.slug !== 'triggers-overview')
  const missing = triggerPages.filter(p => !triggerHubs[p.slug])
  if (missing.length > 0) {
    console.warn(`prebuild-hub-data: ${missing.length} TRIGGER_HUB slugs have no D1 data (0 videos): ${missing.slice(0,5).map(p=>p.slug).join(', ')}`)
  }
} catch {}
