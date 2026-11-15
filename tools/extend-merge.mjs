#!/usr/bin/env node
// extend-merge: merge per-slug state/extend-{slug}.json files → normalized temp file for grind-apply
// Usage: node tools/extend-merge.mjs slug1 slug2 ...
// Output: state/grind-prose-temp-extend.json + per-slug word counts on stdout
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const slugs = process.argv.slice(2)
if (!slugs.length) { console.error('Usage: node tools/extend-merge.mjs slug1 slug2 ...'); process.exit(1) }

const JARGON = {
  neurological: 'brain-based', physiological: 'physical',
  parasympathetic: 'calming', cognitive: 'mental',
  stimuli: 'triggers', cortisol: 'stress hormone', bilateral: 'left-right',
}
function norm(s) {
  if (!s) return s
  s = s.replace(/\s*--\s*/g, ', ').replace(/—/g, ', ')
  for (const [bad, good] of Object.entries(JARGON)) s = s.replace(new RegExp('\\b' + bad + '\\b', 'gi'), good)
  return s
}

const all = []
let fail = false
for (const slug of slugs) {
  const f = path.join(ROOT, 'state', `extend-${slug}.json`)
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''))
    for (const r of d) {
      r.prose.introHtml = norm(r.prose.introHtml)
      r.prose.metaDescription = norm(r.prose.metaDescription)
      if (r.prose.sections) {
        r.prose.sections = r.prose.sections.map(s => ({ heading: norm(s.heading), content: norm(s.content) }))
        r.prose.proTips = [] // clear legacy bullets when sections present
      }
      const introW = (r.prose.introHtml || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
      const secW = (r.prose.sections || []).reduce((acc, s) => acc + (s.content || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length, 0)
      const w = introW + secW
      console.log(`${r.slug}: intro=${introW}w secs=${secW}w total=${w}w${w < 2000 ? ' THIN' : ''}`)
      all.push(r)
    }
  } catch (e) {
    console.error(`FAIL ${slug}: ${e.message}`)
    fail = true
  }
}
fs.writeFileSync(path.join(ROOT, 'state', 'grind-prose-temp-extend.json'), JSON.stringify(all))
console.log(`MERGED: ${all.length}/${slugs.length}`)
process.exit(fail ? 1 : 0)
