#!/usr/bin/env node
// grind-apply: write prose → gate → commit → ping IndexNow
// Usage: node tools/grind-apply.mjs --prose-file state/grind-prose-temp.json --date 2026-08-26
import { execSync } from 'child_process'
import fs from 'fs'
import https from 'https'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const proseFileIdx = argv.indexOf('--prose-file')
const proseFile = proseFileIdx >= 0 ? argv[proseFileIdx + 1] : null
const dateIdx = argv.indexOf('--date')
const date = dateIdx >= 0 ? argv[dateIdx + 1] : new Date().toISOString().slice(0, 10)

if (!proseFile) { console.error('--prose-file required'); process.exit(1) }

const proseData = JSON.parse(fs.readFileSync(proseFile, 'utf8'))
const CONTENT_PATH = path.join(ROOT, 'src/lib/asmr-page-content.json')
const data = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'))

// ── Step 1: Write prose ──────────────────────────────────────────────────────
const slugs = proseData.map(r => r.slug)
for (const { slug, prose } of proseData) {
  if (!prose) continue
  data[slug] = Object.assign(data[slug] || {}, prose, { status: 'draft', lastUpdated: date })
}
fs.writeFileSync(CONTENT_PATH, JSON.stringify(data, null, 2))
console.log(`WRITTEN: ${slugs.length} slugs`)

// ── Step 1b-pre: Normalize crossLinks hrefs (strip /guides/ /best/ prefixes, remove dead) ──
for (const slug of slugs) {
  const p = data[slug]
  if (!p?.crossLinks?.length) continue
  const seen = new Set()
  p.crossLinks = p.crossLinks.map(l => {
    let href = (l.href || '').replace(/^\//, '').replace(/\/$/, '')
    href = href.replace(/^(?:guides|best|topics|articles|blog|posts)\//, '')
    return { ...l, href: `/${href}/` }
  }).filter(l => {
    const s = l.href.replace(/^\//, '').replace(/\/$/, '')
    if (!data[s] || data[s].status !== 'published') return false  // dead
    if (s === slug) return false  // self-link
    if (seen.has(s)) return false  // dupe
    seen.add(s)
    return true
  })
}
fs.writeFileSync(CONTENT_PATH, JSON.stringify(data, null, 2))

// ── Step 1b: Normalize shortAnswer (strip HTML, cap 50 words) ────────────────
// Extend workflow only patches introHtml — existing faqItems may have HTML in shortAnswer.
// Normalize before gating so shortAnswerFails doesn't block extend-only runs.
for (const slug of slugs) {
  const p = data[slug]
  if (!p?.faqItems) continue
  p.faqItems = p.faqItems.map(f => {
    // Empty shortAnswer: derive from first sentences of answer
    const src = (f.shortAnswer && f.shortAnswer.trim()) ? f.shortAnswer : (f.answer || '')
    const stripped = src.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const words = stripped.split(/\s+/)
    return { ...f, shortAnswer: words.slice(0, 45).join(' ') }
  })
}
fs.writeFileSync(CONTENT_PATH, JSON.stringify(data, null, 2))

// ── Step 2: Gate ─────────────────────────────────────────────────────────────
const AI_FILLER = ['furthermore','moreover','delve','leverage','utilize','foster','harness','embark','robust','seamless','holistic','paradigm','cornerstone','game-changer','it\'s worth noting','it is worth noting','it\'s important to note','it is important to note','it\'s crucial','it is crucial','when it comes to','in the realm of','in conclusion','in summary','to summarize','navigating','navigate the','ensuring that','ensuring the','by leveraging','by utilizing','in today\'s','in today\'s world','it\'s essential','it is essential','take your','take a deep dive','dive into','a deep dive','shed light','sheds light','shed some light','play a crucial','plays a crucial','plays a vital','play a vital','remains a','remains an important','at the end of the day','without further ado']
const JARGON = ['parasympathetic','mirror neurons','cortisol','neurological','physiological','cognitive','stimuli']
// Encyclopedia openers — definitions and origin stories add no value for users who already know what ASMR is
// Encyclopedia openers banned on non-definition pages (definition pages like what-does-asmr-mean* are exempt via content)
const ENCYCLOPEDIA = ['was first coined','was coined in','in this guide we','in this guide, we','many people wonder','many people ask','you may have wondered','you may wonder','asmr is a phenomenon','asmr was first','welcome to the world of asmr']
const ASMR_STOP = new Set(['asmr','that','this','with','have','from','they','will','your','what','when','which','there','their','been','more','also','some','than','were','into','most','over','just','like','only','very','even','both','each','such','well','then','them','here','make','many','does','its','sound','sounds','video','videos','trigger','triggers','listen','people','really','these','those','about','other','after','before','first','because','should','would','could','often','might'])

function w5grams(t) {
  const words = t.toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !ASMR_STOP.has(w))
  const s = new Set()
  for (let i = 0; i <= words.length - 5; i++) s.add(words.slice(i, i + 5).join(' '))
  return s
}
function shingleJ(a, b) {
  let inter = 0; for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter || 1)
}
function exactSents(t) {
  return t.split(/[.!?]+/).map(s => s.trim().toLowerCase().replace(/\s+/g, ' ')).filter(s => s.length > 40)
}

const publishedSlugs = Object.keys(data).filter(s => !slugs.includes(s) && data[s]?.status === 'published')

// Pre-compute published grams + sentences once
const pubGrams = publishedSlugs.map(s => {
  const q = data[s]
  const qt = [q.introHtml || '', ...(q.faqItems || []).map(f => f.answer || ''), ...(q.proTips || []), ...(q.sections || []).map(s => `${s.heading} ${s.content}`)].join(' ')
  return { slug: s, grams: w5grams(qt), text: qt.replace(/<[^>]+>/g, ' ') }
})
const seenSents = new Set()
pubGrams.forEach(({ text }) => exactSents(text).forEach(x => seenSents.add(x)))

const passed = [], blocked = []

for (const slug of slugs) {
  const p = data[slug]
  if (!p || !p.introHtml) { blocked.push(`${slug}: no content`); continue }
  const allText = [p.introHtml || '', ...(p.faqItems || []).map(b => `${b.question} ${b.answer} ${b.shortAnswer || ''}`), ...(p.proTips || []), ...(p.sections || []).map(s => `${s.heading} ${s.content}`)].join(' ')
  const text = allText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const fails = []

  if ((text.match(/--/g) || []).length > 0) fails.push('emDashes')
  const aiFound = AI_FILLER.filter(ph => new RegExp(`\\b${ph}\\b`, 'i').test(text))
  if (aiFound.length) fails.push(`aiFiller:${aiFound.join(',')}`)
  const jargonFound = JARGON.filter(ph => new RegExp(`\\b${ph}\\b`, 'i').test(text))
  if (jargonFound.length) fails.push(`jargon:${jargonFound.join(',')}`)
  const encFound = ENCYCLOPEDIA.filter(ph => text.toLowerCase().includes(ph))
  if (encFound.length) fails.push(`encyclopedia:${encFound.map(p=>p.slice(0,20)).join(',')}`)
  if (!p.metaDescription || p.metaDescription.length > 160 || !p.metaDescription.includes('ASMR')) fails.push('metaDescription')
  // crossLinks: every href must resolve to a published slug
  const deadLinks = (p.crossLinks || []).filter(l => {
    const s = (l.href || '').replace(/^\//, '').replace(/\/$/, '')
    return !data[s] || data[s].status !== 'published'
  })
  if (deadLinks.length) fails.push(`deadCrossLinks:${deadLinks.map(l => l.href).join(',')}`)
  // Prose word floor — introHtml + sections[] combined must reach 2000w
  const introWords = (p.introHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length
  const secWords = (p.sections || []).reduce((acc, s) => acc + (s.content || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, 0)
  if (introWords + secWords < 2000) fails.push(`thinProse:intro=${introWords}w secs=${secWords}w total=${introWords + secWords}w`)

  if ((p.faqItems || []).length < 3) fails.push(`faqItems:${(p.faqItems || []).length}`)
  // sections[] (new format) OR proTips[] (legacy) — one must be present and non-empty
  const hasSections = (p.sections || []).length >= 3
  const hasProTips = (p.proTips || []).length >= 3
  if (!hasSections && !hasProTips) fails.push(`missingSections:need sections>=3 or proTips>=3`)
  // If sections[] present, validate each has heading + content >= 50w
  if (hasSections) {
    const thinSections = (p.sections || []).filter(s => !s.heading || (s.content || '').replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length < 50)
    if (thinSections.length) fails.push(`thinSections:${thinSections.length}`)
  }
  const shortAnswerFails = (p.faqItems || []).filter(f => !f.shortAnswer || /<[a-z\/]/i.test(f.shortAnswer) || f.shortAnswer.split(/\s+/).length > 50)
  if (shortAnswerFails.length) fails.push(`shortAnswerFails:${shortAnswerFails.length}`)

  const curGrams = w5grams(text)
  let maxShingle = 0, maxShingleSlug = ''
  pubGrams.forEach(({ slug: s, grams }) => { const sim = shingleJ(curGrams, grams); if (sim > maxShingle) { maxShingle = sim; maxShingleSlug = s } })
  if (maxShingle > 0.12) fails.push(`w5gramClone:${maxShingle.toFixed(3)} vs ${maxShingleSlug}`)

  const dupeSents = exactSents(text).filter(s => seenSents.has(s))
  if (dupeSents.length >= 2) fails.push(`exactDupes:${dupeSents.length}`)
  // Within-page paragraph repeat check (catches Opus self-repetition)
  const paraTexts = (p.introHtml || '').match(/<p[^>]*>[\s\S]*?<\/p>/g) || []
  const paraNorm = paraTexts.map(s => s.replace(/<[^>]+>/g, '').trim().toLowerCase().replace(/\s+/g, ' '))
  const paraCount = new Map()
  paraNorm.forEach(t => paraCount.set(t, (paraCount.get(t) || 0) + 1))
  const inPageDups = [...paraCount.entries()].filter(([t, n]) => n >= 2 && t.length > 40)
  if (inPageDups.length) fails.push(`inPageDupParas:${inPageDups.length}`)

  if (fails.length) blocked.push(`${slug}: ${fails.join(' | ')}`)
  else passed.push(slug)
}

// Step 3: Set published + write
for (const slug of passed) data[slug].status = 'published'
fs.writeFileSync(CONTENT_PATH, JSON.stringify(data, null, 2))
console.log(`GATE PASSED: ${passed.join(', ') || 'none'}`)
console.log(`GATE BLOCKED: ${blocked.join(' || ') || 'none'}`)

// ── Step 4: Build-first, then commit — build failure aborts before any git ops ──
if (passed.length > 0) {
  // Load .env so wrangler has CLOUDFLARE_API_TOKEN
  const envPath = path.join(ROOT, '.env')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const eq = line.indexOf('='); if (eq < 1 || line.startsWith('#')) continue
      const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '').replace(/\r$/, '')
      if (!(k in process.env)) process.env[k] = v
    }
  }

  // Write build stamp BEFORE build so it's baked into the Worker bundle
  const gitHash = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
  const buildStamp = `${gitHash}-${Date.now()}`
  const stampPath = path.join(ROOT, 'public', 'build-stamp.txt')
  fs.mkdirSync(path.join(ROOT, 'public'), { recursive: true })
  fs.writeFileSync(stampPath, buildStamp + '\n')
  console.log(`Build stamp: ${buildStamp}`)

  // BUILD FIRST — abort before committing if build fails (prevents Aug-23 silent-deploy incident)
  try {
    execSync('node tools/site-audit.mjs', { cwd: ROOT, stdio: 'inherit' })
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit', timeout: 300000 })
  } catch (e) {
    console.error('BUILD FAILED — aborting before commit. Fix the build error then re-run grind-apply.')
    console.error(e.message.slice(0, 400))
    process.exit(1)
  }

  // Build succeeded — now safe to commit + push
  execSync('git add src/lib/asmr-page-content.json', { cwd: ROOT, stdio: 'inherit' })
  execSync(`git commit -m "content(asmr): regrind ${passed.join(', ')}"`, { cwd: ROOT, stdio: 'inherit' })
  execSync('git push', { cwd: ROOT, stdio: 'inherit' })
  console.log(`COMMITTED: ${passed.length} slugs`)

  // ── Step 4b: Deploy ───────────────────────────────────────────────────────────
  try {
    execSync('npx wrangler deploy', { cwd: ROOT, stdio: 'inherit', timeout: 180000 })
    console.log('DEPLOYED via wrangler')

    // ── Build stamp verify — proves live Worker serves THIS build, not a stale one ──
    // Fetches /build-stamp.txt from live domain and compares to the stamp written before build.
    // A stale Worker will serve an old stamp → fails loud → can't be silently missed.
    let stampVerified = false
    for (let attempt = 1; attempt <= 8; attempt++) {
      await new Promise(r => setTimeout(r, attempt === 1 ? 5000 : 3000))
      const liveStamp = await new Promise(resolve => {
        https.get('https://asmrregistry.com/build-stamp.txt', res => {
          let d = ''
          res.on('data', c => d += c)
          res.on('end', () => resolve(d.trim()))
          res.on('error', () => resolve(''))
        }).on('error', () => resolve(''))
      })
      if (liveStamp === buildStamp) {
        console.log(`\n✅ DEPLOY VERIFIED: live stamp matches (${buildStamp})`)
        stampVerified = true
        break
      }
      console.log(`  Stamp attempt ${attempt}/8: live="${liveStamp}" expected="${buildStamp}"`)
    }
    if (!stampVerified) {
      console.error(`\n\n🚨🚨 DEPLOY STAMP MISMATCH — Worker is serving a STALE BUILD`)
      console.error(`   Expected: ${buildStamp}`)
      console.error(`   The deploy command returned success but the live domain did not update.`)
      console.error(`   Check Cloudflare dashboard → Workers → asmrregistry → Deployments`)
      console.error(`   DO NOT mark this deploy as complete until stamp matches.\n`)
      process.exitCode = 1
    }
  } catch (e) {
    console.error('DEPLOY FAILED:', e.message.slice(0, 300))
  }

  // ── Step 5: IndexNow ping ───────────────────────────────────────────────────
  try {
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/asmr-keyword-ledger.json'), 'utf8'))
    const slugToUrl = Object.fromEntries(ledger.pages.map(p => [p.slug, p.targetUrl]))
    const urlList = passed.map(s => `https://asmrregistry.com${slugToUrl[s] || `/${s}/`}`)
    const body = JSON.stringify({ host: 'asmrregistry.com', key: 'a7f3c9e2b4d8f1a6', keyLocation: 'https://asmrregistry.com/a7f3c9e2b4d8f1a6.txt', urlList })
    await new Promise(resolve => {
      const req = https.request(
        { hostname: 'api.indexnow.org', path: '/indexnow', method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) } },
        res => { res.resume(); res.on('end', () => { console.log(`IndexNow: ${res.statusCode} (${urlList.length} urls)`); resolve() }) }
      )
      req.on('error', e => { console.error('IndexNow error:', e.message); resolve() })
      req.write(body); req.end()
    })
  } catch (e) {
    console.error('IndexNow skip:', e.message)
  }

  // ── Step 6: GSC Indexing API ────────────────────────────────────────────────
  try {
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/asmr-keyword-ledger.json'), 'utf8'))
    const slugToUrl = Object.fromEntries(ledger.pages.map(p => [p.slug, p.targetUrl]))
    const urlList = passed.map(s => `https://asmrregistry.com${slugToUrl[s] || `/${s}/`}`)

    // Load .env for GI_SERVICE_ACCOUNT_JSON
    const envPath = path.join(ROOT, '.env')
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const eq = line.indexOf('='); if (eq < 1 || line.startsWith('#')) continue
        const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
        if (!(k in process.env)) process.env[k] = v
      }
    }
    if (!process.env.GI_SERVICE_ACCOUNT_JSON) throw new Error('GI_SERVICE_ACCOUNT_JSON not set')
    const creds = JSON.parse(process.env.GI_SERVICE_ACCOUNT_JSON)

    const { createSign } = await import('crypto')
    const now = Math.floor(Date.now() / 1000)
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ iss: creds.client_email, scope: 'https://www.googleapis.com/auth/indexing', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })).toString('base64url')
    const sig = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(creds.private_key, 'base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}` })
    const { access_token } = await tokenRes.json()

    let gscOk = 0
    for (const url of urlList) {
      const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url, type: 'URL_UPDATED' })
      })
      if (res.ok) gscOk++; else console.warn(`GSC: ${res.status} ${url}`)
      await new Promise(r => setTimeout(r, 1100))
    }
    console.log(`GSC Indexing API: ${gscOk}/${urlList.length} submitted`)
  } catch (e) {
    console.error('GSC index skip:', e.message)
  }
}

// ── Result JSON (workflow reads this) ─────────────────────────────────────────
const result = { passed, blocked }
fs.writeFileSync(path.join(ROOT, 'state/grind-apply-result.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
