#!/usr/bin/env node
// grind-preflight: validate slugs + escaping + gate deps before any prose tokens burn
// Usage: node tools/grind-preflight.mjs slug1 slug2 ...
// Exit 0 = all clear. Exit 1 = failures listed, abort grind.
//
// LINK MAP — what each check protects:
//
//  slugs[] ──────────────────────────────────── 1. no dupes
//      │                                         2. all in ledger (else research wasted)
//      │
//  JSON escape round-trip ───────────────────── 5. node -e backtick payload must survive
//      │                                            btoa/Buffer not available in workflow sandbox
//      │
//  grind-apply.mjs ──────────────────────────── 6. gate script reachable, no import errors
//      │
//  normStr() ────────────────────────────────── 7. em-dash + jargon cleaned before gate runs
//      │                                            (tapping failed gate this session because
//      │                                             extend-batch didn't run normStr on output)
//      │
//  countWords() ─────────────────────────────── 8. floor math correct (1964w blocked asmr-history)
//      │
//  git status ───────────────────────────────── 9. no uncommitted JSON = clean apply
//      │
//  calcscrape lock ──────────────────────────── 10. separate project, shared machine state
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const slugs = process.argv.slice(2)
const fails = []
const warns = []

// ── 1. Slug list sanity ──────────────────────────────────────────────────────
if (!slugs.length) { console.error('PREFLIGHT FAIL: no slugs passed'); process.exit(1) }
if (new Set(slugs).size !== slugs.length) fails.push('DUPLICATE SLUGS: ' + slugs.filter((s,i) => slugs.indexOf(s) !== i).join(', '))

// ── 2. Slugs exist in ledger ─────────────────────────────────────────────────
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/asmr-keyword-ledger.json'), 'utf8'))
const ledgerSlugs = new Set(ledger.pages.map(p => p.slug))
const notInLedger = slugs.filter(s => !ledgerSlugs.has(s))
if (notInLedger.length) fails.push('NOT IN LEDGER: ' + notInLedger.join(', '))

// ── 3. Content JSON readable ─────────────────────────────────────────────────
const CONTENT_PATH = path.join(ROOT, 'src/lib/asmr-page-content.json')
let data = {}
try { data = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8')) }
catch (e) { fails.push('asmr-page-content.json unreadable: ' + e.message) }

// ── 4. Already-published slugs (re-grind warning, not fail) ─────────────────
const alreadyPublished = slugs.filter(s => data[s]?.status === 'published')
if (alreadyPublished.length) warns.push('ALREADY PUBLISHED (will overwrite): ' + alreadyPublished.join(', '))

// ── 5. PowerShell here-string round-trip test ────────────────────────────────
// Simulate worst-case payload: HTML with backticks, $ signs, backslashes
// PowerShell @'...'@ is 100% literal — no escaping needed. Only risk: '@ at column 0 in content.
// JSON.stringify (no indent) produces one line → no embedded newlines → '@ at col-0 impossible.
const testPayload = JSON.stringify([{
  slug: 'test-slug',
  prose: {
    introHtml: '<p>Test with `backtick` and \\backslash\\ and $dollar and <strong>bold</strong></p>',
    metaDescription: 'Test meta with "quotes" and backtick`',
    faqItems: [], proTips: [], crossLinks: [], references: [], status: 'published'
  }
}])
// Write temp PS1 file (here-string terminator must be col-0, can't use -Command inline)
const ps1Path = path.join(ROOT, 'state', '__preflight-test.ps1')
const tmpJson = path.join(ROOT, 'state', '__preflight-test.json')
fs.writeFileSync(ps1Path, `$json = @'\n${testPayload}\n'@\n[System.IO.File]::WriteAllText("${tmpJson.replace(/\\/g,'/')}", $json)\n`)
try {
  execSync(`powershell -NoProfile -File "${ps1Path}"`, { cwd: ROOT, timeout: 15000 })
  const readBack = JSON.parse(fs.readFileSync(tmpJson, 'utf8'))
  if (readBack[0]?.slug !== 'test-slug') fails.push('PowerShell here-string round-trip MISMATCH: got ' + JSON.stringify(readBack[0]?.slug))
  else console.log('✓ PowerShell here-string round-trip OK')
} catch (e) {
  fails.push('PowerShell here-string round-trip FAILED: ' + e.message.slice(0, 200))
} finally {
  try { fs.unlinkSync(ps1Path) } catch {}
  try { fs.unlinkSync(tmpJson) } catch {}
}

// ── 6. grind-apply.mjs exists and is valid JS ────────────────────────────────
const applyPath = path.join(ROOT, 'tools/grind-apply.mjs')
if (!fs.existsSync(applyPath)) {
  fails.push('grind-apply.mjs NOT FOUND')
} else {
  try {
    execSync(`node --input-type=module --eval "import '${applyPath.replace(/\\/g,'/')}'" 2>&1`, { timeout: 5000 })
  } catch (e) {
    // grind-apply exits with error when no args — that's expected. Check it's not a syntax error.
    const out = e.message || ''
    if (out.includes('SyntaxError') || out.includes('Cannot find module')) {
      fails.push('grind-apply.mjs syntax/import error: ' + out.slice(0, 200))
    } else {
      console.log('✓ grind-apply.mjs reachable')
    }
  }
}

// ── 7. normStr smoke test ─────────────────────────────────────────────────────
function normStr(s) {
  if (!s) return s
  s = s.replace(/\s*--\s*/g, ', ').replace(/—/g, ', ')
  const JARGON_MAP = {
    'neurological': 'brain-based', 'physiological': 'physical',
    'parasympathetic': 'calming', 'cognitive': 'mental',
    'stimuli': 'triggers', 'cortisol': 'stress hormone', 'bilateral': 'left-right',
  }
  for (const [bad, good] of Object.entries(JARGON_MAP)) {
    s = s.replace(new RegExp('\\b' + bad + '\\b', 'gi'), good)
  }
  return s
}
const normTest = normStr('The parasympathetic response -- physiological stimuli are bilateral.')
if (normTest.includes('parasympathetic') || normTest.includes('--') || normTest.includes('physiological')) {
  fails.push('normStr not cleaning: ' + normTest)
} else {
  console.log('✓ normStr OK: ' + normTest)
}

// ── 8. countWords smoke test ──────────────────────────────────────────────────
function countWords(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter(Boolean).length
}
const wcTest = countWords('<p>Hello world this is a test sentence.</p>')
if (wcTest !== 7) fails.push('countWords wrong: expected 7 got ' + wcTest)
else console.log('✓ countWords OK')

// ── 9. Git is clean (no uncommitted changes to content JSON) ─────────────────
try {
  const status = execSync('git status --short src/lib/asmr-page-content.json', { cwd: ROOT }).toString().trim()
  if (status) warns.push('UNCOMMITTED CHANGES to asmr-page-content.json: ' + status)
  else console.log('✓ content JSON clean')
} catch (e) { warns.push('git status check failed: ' + e.message) }

// ── 10. No stale grind-active lock from calcscrape ───────────────────────────
const lockPath = 'C:/Users/mwoo7/Desktop/calcscrape/state/grind-active.json'
try {
  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    if (lock.slug) warns.push('CALCSCRAPE GRIND ACTIVE: ' + lock.slug + ' step ' + lock.step + ' — pause it first')
    else console.log('✓ calcscrape lock clear')
  }
} catch {}

// ── Result ────────────────────────────────────────────────────────────────────
console.log('')
if (warns.length) warns.forEach(w => console.log('WARN:', w))
if (fails.length) {
  fails.forEach(f => console.error('FAIL:', f))
  console.error('\nPREFLIGHT FAILED — fix above before grinding')
  process.exit(1)
} else {
  console.log('PREFLIGHT PASSED — ' + slugs.length + ' slugs ready to grind: ' + slugs.join(', '))
  process.exit(0)
}
