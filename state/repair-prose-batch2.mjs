import fs from 'fs'

const slugs = [
  'asmr-rain-on-tent',
  'asmr-coffee-shop',
  'asmr-and-dopamine',
  'asmr-vs-white-noise',
  'how-to-find-your-asmr-triggers',
  'asmr-immunity',
  'asmr-and-introverts',
  'asmr-placebo-or-real'
]

for (const slug of slugs) {
  const f = `state/prose-${slug}.json`
  if (!fs.existsSync(f)) { console.log(slug + ': missing'); continue }

  let raw = fs.readFileSync(f, 'utf8')

  // Remove BOM if present
  raw = raw.replace(/^﻿/, '')

  // Try parsing first
  let obj
  try {
    obj = JSON.parse(raw)
  } catch (e) {
    // Fix common issues: unescaped double quotes inside JSON string values
    // Strategy: replace em-dashes in raw text, then try to fix JSON
    console.log(slug + ': JSON parse error, attempting repair...')

    // Replace em dashes with comma or period
    raw = raw.replace(/—/g, ',')

    // Try again
    try {
      obj = JSON.parse(raw)
    } catch (e2) {
      // More aggressive: extract and rebuild by reading the raw text
      console.log(slug + ': still failing: ' + e2.message.slice(0, 80))
      continue
    }
  }

  // Now fix content within the parsed object
  function fixStr(s) {
    if (typeof s !== 'string') return s
    return s
      .replace(/—/g, ', ')  // em dash -> comma space
      .replace(/–/g, '-')   // en dash -> hyphen
  }

  function fixDeep(o) {
    if (typeof o === 'string') return fixStr(o)
    if (Array.isArray(o)) return o.map(fixDeep)
    if (o && typeof o === 'object') {
      const out = {}
      for (const [k, v] of Object.entries(o)) out[k] = fixDeep(v)
      return out
    }
    return o
  }

  obj = fixDeep(obj)

  // Fix metaDescription length
  if (obj.metaDescription && obj.metaDescription.length > 160) {
    obj.metaDescription = obj.metaDescription.slice(0, 157) + '...'
  }

  // Ensure ASMR in metaDescription
  if (obj.metaDescription && !obj.metaDescription.includes('ASMR')) {
    obj.metaDescription = 'ASMR: ' + obj.metaDescription.slice(0, 154)
  }

  fs.writeFileSync(f, JSON.stringify(obj, null, 2), 'utf8')
  console.log(slug + ': repaired')
}

console.log('Done')
