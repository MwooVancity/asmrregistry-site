#!/usr/bin/env node
// quality-audit.mjs — scan all published pages for unhelpful content patterns
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/asmr-page-content.json'), 'utf8'))

const published = Object.entries(data).filter(([,v]) => v?.status === 'published')

// ── 1. Cross-page duplicate proTips ─────────────────────────────────────────
const tipMap = new Map() // tip text → [slug, ...]
for (const [slug, p] of published) {
  for (const tip of (p.proTips || [])) {
    const norm = tip.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!tipMap.has(norm)) tipMap.set(norm, [])
    tipMap.get(norm).push(slug)
  }
}
const dupeTips = [...tipMap.entries()].filter(([, slugs]) => slugs.length >= 3)
  .sort((a, b) => b[1].length - a[1].length)

// ── 2. Short/thin proTips (< 15 words) ──────────────────────────────────────
const shortTips = []
for (const [slug, p] of published) {
  for (const tip of (p.proTips || [])) {
    const wc = tip.trim().split(/\s+/).length
    if (wc < 15) shortTips.push({ slug, tip: tip.slice(0, 80), wc })
  }
}

// ── 3. Generic proTips (contain none of slug's keywords) ────────────────────
function slugWords(slug) {
  return new Set(slug.replace(/-/g, ' ').split(' ').filter(w => w.length > 3 && w !== 'asmr'))
}
const offTopicTips = []
for (const [slug, p] of published) {
  const keys = slugWords(slug)
  if (keys.size === 0) continue
  for (const tip of (p.proTips || [])) {
    const tipLower = tip.toLowerCase()
    const hasKey = [...keys].some(k => tipLower.includes(k))
    if (!hasKey) offTopicTips.push({ slug, tip: tip.slice(0, 100) })
  }
}

// ── 4. Thin faqItem answers (< 40 words) ────────────────────────────────────
const thinFaq = []
for (const [slug, p] of published) {
  for (const faq of (p.faqItems || [])) {
    const answerText = (faq.answer || '').replace(/<[^>]+>/g, ' ').trim()
    const wc = answerText.split(/\s+/).filter(Boolean).length
    if (wc < 40) thinFaq.push({ slug, q: (faq.question || '').slice(0, 80), wc })
  }
}

// ── 5. faqItem questions with no slug keyword ────────────────────────────────
const offTopicFaq = []
for (const [slug, p] of published) {
  const keys = slugWords(slug)
  if (keys.size === 0) continue
  for (const faq of (p.faqItems || [])) {
    const qLower = (faq.question || '').toLowerCase()
    const aLower = (faq.answer || '').toLowerCase().replace(/<[^>]+>/g, ' ')
    const hasKey = [...keys].some(k => qLower.includes(k) || aLower.includes(k))
    if (!hasKey) offTopicFaq.push({ slug, q: (faq.question || '').slice(0, 100) })
  }
}

// ── 6. Pages with zero proTips AND zero sections (legacy gap) ────────────────
const noContent = published.filter(([, p]) =>
  (!p.proTips || p.proTips.length === 0) && (!p.sections || p.sections.length === 0)
).map(([s]) => s)

// ── Output ───────────────────────────────────────────────────────────────────
console.log('=== QUALITY AUDIT ===\n')

console.log(`CROSS-PAGE DUPLICATE proTips (same tip on 3+ pages): ${dupeTips.length}`)
dupeTips.slice(0, 15).forEach(([tip, slugs]) => {
  console.log(`  [${slugs.length} pages] "${tip.slice(0, 80)}"`)
  console.log(`    pages: ${slugs.slice(0, 5).join(', ')}${slugs.length > 5 ? '...' : ''}`)
})

console.log(`\nSHORT proTips (< 15 words): ${shortTips.length}`)
shortTips.slice(0, 10).forEach(t => console.log(`  ${t.slug}: "${t.tip}" (${t.wc}w)`))

console.log(`\nOFF-TOPIC proTips (no slug keyword): ${offTopicTips.length}`)
offTopicTips.slice(0, 15).forEach(t => console.log(`  ${t.slug}: "${t.tip}"`))

console.log(`\nTHIN faqItem answers (< 40 words): ${thinFaq.length}`)
thinFaq.slice(0, 10).forEach(t => console.log(`  ${t.slug}: "${t.q}" (${t.wc}w)`))

console.log(`\nOFF-TOPIC faq questions (no slug keyword in Q or A): ${offTopicFaq.length}`)
offTopicFaq.slice(0, 15).forEach(t => console.log(`  ${t.slug}: "${t.q}"`))

console.log(`\nPAGES WITH NO proTips AND NO sections: ${noContent.length}`)
if (noContent.length) console.log(' ', noContent.join(', '))

const out = { dupeTips: dupeTips.map(([tip, slugs]) => ({ tip, slugs })), shortTips, offTopicTips, thinFaq, offTopicFaq, noContent }
fs.writeFileSync(path.join(ROOT, 'state/quality-audit.json'), JSON.stringify(out, null, 2))
console.log('\nWritten: state/quality-audit.json')
