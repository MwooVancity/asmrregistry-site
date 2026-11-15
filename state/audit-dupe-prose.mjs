import fs from 'fs'

const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))
const published = Object.entries(data).filter(([, p]) => p.status === 'published')

function exactSents(t) {
  return t.split(/[.!?]+/).map(s => s.trim().toLowerCase().replace(/\s+/g, ' ')).filter(s => s.length > 40)
}

function pageText(page) {
  return [(page.introHtml || ''), ...(page.faqItems || []).map(f => f.question + ' ' + f.answer + ' ' + (f.shortAnswer || '')), ...(page.proTips || []), ...(page.sections || []).map(s => s.heading + ' ' + s.content)].join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
}

// Build sentence → [slugs] map
const sentToSlugs = new Map()
for (const [slug, page] of published) {
  const sents = exactSents(pageText(page))
  for (const sent of sents) {
    if (!sentToSlugs.has(sent)) sentToSlugs.set(sent, [])
    sentToSlugs.get(sent).push(slug)
  }
}

// Find sentences shared by ≥2 pages
const dupes = []
for (const [sent, slugs] of sentToSlugs) {
  if (slugs.length >= 2) dupes.push({ sent, slugs, count: slugs.length })
}
dupes.sort((a, b) => b.count - a.count)

console.log(`Total duplicate sentences (≥2 pages): ${dupes.length}`)
console.log(`\nTop 30 most-shared sentences:`)
dupes.slice(0, 30).forEach(d => {
  console.log(`  [${d.count} pages] "${d.sent.slice(0, 90)}"`)
  if (d.count <= 5) console.log(`    Pages: ${d.slugs.join(', ')}`)
})

// Pages with ≥2 dupe sentences vs other pages (gate threshold)
const pagesDupeCount = {}
for (const [slug] of published) pagesDupeCount[slug] = 0
for (const { sent, slugs } of dupes) {
  if (slugs.length < 2) continue
  for (const slug of slugs) pagesDupeCount[slug] = (pagesDupeCount[slug] || 0) + 1
}

const pagesWithDupes = Object.entries(pagesDupeCount).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1])
console.log(`\nPages with ≥2 dupe sentences vs other pages: ${pagesWithDupes.length}`)
pagesWithDupes.slice(0, 20).forEach(([slug, count]) => console.log(`  ${slug}: ${count} dupe sents`))

fs.writeFileSync('state/dupe-prose-audit.json', JSON.stringify({ dupes: dupes.slice(0, 100), pagesWithDupes }, null, 2))
console.log('\nFull audit → state/dupe-prose-audit.json')
