// Hard repair: extract each JSON field by matching the outermost structure
// The files have unescaped " inside string values breaking JSON.parse
// Strategy: use a regex to find the bad strings and escape the inner quotes
import fs from 'fs'

const slugs = ['asmr-and-dopamine', 'how-to-find-your-asmr-triggers', 'asmr-placebo-or-real']

for (const slug of slugs) {
  const f = `state/prose-${slug}.json`
  let raw = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').replace(/—/g, ', ').replace(/–/g, '-')

  // Fix unescaped double quotes inside JSON string values
  // JSON string values are delimited by unescaped ": at start and ": or ", or "} at end
  // Simple approach: scan char by char and escape inner quotes
  let result = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (escaped) {
      result += c
      escaped = false
      continue
    }
    if (c === '\\') {
      result += c
      escaped = true
      continue
    }
    if (c === '"') {
      if (!inString) {
        inString = true
        result += c
      } else {
        // Check if this closes the string: next non-space char should be :, ,, }, ]
        let j = i + 1
        while (j < raw.length && raw[j] === ' ') j++
        const next = raw[j]
        if (next === ':' || next === ',' || next === '}' || next === ']' || next === '\n' || next === '\r') {
          inString = false
          result += c
        } else {
          // This is an unescaped quote inside the string — escape it
          result += '\\"'
        }
      }
      continue
    }
    result += c
  }

  try {
    const obj = JSON.parse(result)
    // Fix metaDescription
    if (obj.metaDescription && obj.metaDescription.length > 160) {
      obj.metaDescription = obj.metaDescription.slice(0, 157) + '...'
    }
    if (obj.metaDescription && !obj.metaDescription.includes('ASMR')) {
      obj.metaDescription = 'ASMR: ' + obj.metaDescription.slice(0, 154)
    }
    fs.writeFileSync(f, JSON.stringify(obj, null, 2), 'utf8')
    console.log(slug + ': fixed')
  } catch (e) {
    console.log(slug + ': STILL FAILING: ' + e.message.slice(0, 100))
    // Write the partially-fixed version for manual inspection
    fs.writeFileSync(`state/prose-${slug}-debug.txt`, result.slice(0, 3000), 'utf8')
    console.log('  debug written to state/prose-' + slug + '-debug.txt')
  }
}
