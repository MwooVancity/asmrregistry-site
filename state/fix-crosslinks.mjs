import fs from 'fs'

const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))
const published = new Set(Object.keys(data).filter(s => data[s]?.status === 'published'))

function resolveHref(href) {
  // Strip leading slash, strip /guides/ or /best/ prefix, strip trailing slash
  let slug = (href || '').replace(/^\//, '').replace(/\/$/, '')
  slug = slug.replace(/^guides\//, '').replace(/^best\//, '')
  if (published.has(slug)) return `/${slug}/`
  return null  // dead link — remove
}

let fixed = 0, removed = 0, pagesChanged = 0

for (const [slug, page] of Object.entries(data)) {
  if (page.status !== 'published') continue
  const links = page.crossLinks || []
  if (!links.length) continue

  const newLinks = []
  const seen = new Set()

  for (const link of links) {
    const resolved = resolveHref(link.href)
    const targetSlug = resolved ? resolved.replace(/^\//, '').replace(/\/$/, '') : null

    if (!resolved) {
      removed++
      continue  // dead link
    }
    if (targetSlug === slug) continue  // self-link
    if (seen.has(targetSlug)) continue  // dupe

    seen.add(targetSlug)
    if (link.href !== resolved) {
      newLinks.push({ ...link, href: resolved })
      fixed++
    } else {
      newLinks.push(link)
    }
  }

  if (newLinks.length !== links.length || fixed > 0) {
    data[slug].crossLinks = newLinks
    pagesChanged++
  }
}

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(data, null, 2))
console.log(`Fixed hrefs: ${fixed} | Removed dead: ${removed} | Pages changed: ${pagesChanged}`)

// Re-audit
const broken2 = []
const thin2 = []
for (const [slug, page] of Object.entries(data)) {
  if (page.status !== 'published') continue
  const links = page.crossLinks || []
  const brokenLinks = links.filter(l => {
    const s = (l.href || '').replace(/^\//, '').replace(/\/$/, '')
    return !published.has(s)
  })
  if (brokenLinks.length) brokenLinks.forEach(l => broken2.push({ slug, href: l.href }))
  if (links.length < 3) thin2.push({ slug, count: links.length })
}
console.log(`After fix — broken: ${broken2.length} | thin (<3): ${thin2.length}`)
if (broken2.length) broken2.slice(0, 10).forEach(b => console.log('  STILL BROKEN:', b.slug, b.href))
if (thin2.length) thin2.forEach(t => console.log('  THIN:', t.slug, t.count, 'links'))
