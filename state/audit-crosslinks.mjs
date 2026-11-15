import fs from 'fs'

const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))
const published = new Set(Object.keys(data).filter(s => data[s]?.status === 'published'))

const broken = []     // {slug, href, label}
const thin = []       // {slug, count}
const good = []       // {slug, count}

for (const [slug, page] of Object.entries(data)) {
  if (page.status !== 'published') continue
  const links = page.crossLinks || []

  // Extract slug from href like /asmr-for-sleep/ or asmr-for-sleep
  const brokenLinks = links.filter(l => {
    const href = (l.href || '').replace(/^\//, '').replace(/\/$/, '')
    return !published.has(href)
  })

  if (brokenLinks.length) {
    brokenLinks.forEach(l => broken.push({ slug, href: l.href, label: l.label }))
  }

  if (links.length < 3) thin.push({ slug, count: links.length })
  else good.push({ slug, count: links.length })
}

console.log(`\n=== CROSSLINK AUDIT ===`)
console.log(`Published pages: ${published.size}`)
console.log(`Broken crossLinks: ${broken.length}`)
console.log(`Pages with <3 links: ${thin.length}`)
console.log(`Pages with ≥3 links: ${good.length}`)

if (broken.length) {
  console.log('\n--- BROKEN LINKS ---')
  broken.forEach(b => console.log(`  ${b.slug} → "${b.href}" (${b.label})`))
}

if (thin.length) {
  console.log('\n--- THIN CROSSLINKS (<3) ---')
  thin.forEach(t => console.log(`  ${t.slug}: ${t.count} links`))
}

// Write results
fs.writeFileSync('state/crosslink-audit.json', JSON.stringify({ broken, thin, good }, null, 2))
console.log('\nAudit written to state/crosslink-audit.json')
