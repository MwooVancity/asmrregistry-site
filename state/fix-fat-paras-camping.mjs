import fs from 'fs'

const file = 'src/lib/asmr-page-content.json'
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const p = data['asmr-camping']

// Split a paragraph text into chunks of max 2-3 sentences and max 280 chars
function splitPara(text) {
  const sents = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
  const chunks = []
  let cur = ''
  for (const s of sents) {
    const candidate = cur ? cur + ' ' + s : s
    const sentCount = candidate.split(/[.!?]+/).filter(x => x.trim().length > 5).length
    if (cur && (sentCount > 3 || candidate.length > 280)) {
      chunks.push(cur.trim())
      cur = s
    } else {
      cur = candidate
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}

// Process introHtml: split fat <p> tags
const newParas = []
const paras = p.introHtml.match(/<p[^>]*>[\s\S]*?<\/p>|<h2[^>]*>[\s\S]*?<\/h2>|<ul[^>]*>[\s\S]*?<\/ul>|<li[^>]*>[\s\S]*?<\/li>/g) || []

// Better: process line by line preserving non-p elements
let intro = p.introHtml
// Replace fat <p> with split versions
intro = intro.replace(/<p>([\s\S]*?)<\/p>/g, (match, content) => {
  const text = content.replace(/<[^>]+>/g, '')
  const sents = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
  const sentCount = sents.length
  if (sentCount <= 3 && text.length <= 280) return match
  // split into chunks
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

p.introHtml = intro
data['asmr-camping'] = p
fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
console.log('Fixed fat paragraphs in asmr-camping')

// Verify
const paras2 = p.introHtml.match(/<p[^>]*>[\s\S]*?<\/p>/g) || []
const fat = paras2.filter(pg => {
  const t = pg.replace(/<[^>]+>/g, '')
  return t.split(/[.!?]+/).filter(s => s.trim().length > 5).length > 4 || t.length > 300
})
console.log('Remaining fat paras:', fat.length)
if (fat.length > 0) fat.forEach(f => console.log(' -', f.replace(/<[^>]+>/g,'').slice(0,80)))
