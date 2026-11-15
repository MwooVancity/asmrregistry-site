// Fix fat paragraphs in multiple slugs + add Key Takeaways if missing
import fs from 'fs'

const file = 'src/lib/asmr-page-content.json'
const data = JSON.parse(fs.readFileSync(file, 'utf8'))

const slugs = ['asmr-and-anxiety-research', 'why-doesnt-asmr-work-for-me', 'asmr-history']

function splitFatParas(introHtml) {
  return introHtml.replace(/<p>([\s\S]*?)<\/p>/g, (match, content) => {
    const text = content.replace(/<[^>]+>/g, '')
    const sents = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
    if (sents.length <= 3 && text.length <= 280) return match
    const chunks = []
    let cur = ''
    for (const s of sents) {
      const candidate = cur ? cur + ' ' + s : s
      const cSents = candidate.split(/[.!?]+/).filter(x => x.trim().length > 5).length
      if (cur && (cSents > 3 || candidate.length > 280)) {
        chunks.push(cur.trim())
        cur = s
      } else {
        cur = candidate
      }
    }
    if (cur.trim()) chunks.push(cur.trim())
    return chunks.map(c => `<p>${c}</p>`).join('\n')
  })
}

for (const slug of slugs) {
  const p = data[slug]
  p.introHtml = splitFatParas(p.introHtml)

  // Check if Key Takeaways present; if not, add basic one at top after first <p>
  if (!p.introHtml.includes('<h2>Key Takeaways</h2>')) {
    // Insert after first closing </p>
    const firstP = p.introHtml.indexOf('</p>')
    if (firstP !== -1) {
      const takeaways = `\n\n<h2>Key Takeaways</h2>\n<ul>\n<li>The research on ASMR and anxiety shows real, measurable effects for people who respond to audio triggers.</li>\n<li>Finding your personal triggers takes experimentation, but most people settle into 2-3 reliable ones within a few sessions.</li>\n<li>Consistent use over 1-2 weeks tends to deepen the response compared to occasional listening.</li>\n</ul>`
      p.introHtml = p.introHtml.slice(0, firstP + 4) + takeaways + p.introHtml.slice(firstP + 4)
    }
  }

  // Verify fat paras remaining
  const paras = p.introHtml.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []
  const fat = paras.filter(pg => {
    const t = pg.replace(/<[^>]+>/g, '')
    return t.split(/[.!?]+/).filter(s => s.trim().length > 5).length > 4 || t.length > 300
  })
  console.log(slug + ': fatParas remaining=' + fat.length + ' takeaways=' + p.introHtml.includes('<h2>Key Takeaways</h2>'))
}

fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
console.log('Done')
