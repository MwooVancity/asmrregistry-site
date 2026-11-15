import fs from 'fs'

const file = 'src/lib/asmr-page-content.json'
const data = JSON.parse(fs.readFileSync(file, 'utf8'))

const slugs = [
  'asmr-rain-on-tent', 'asmr-coffee-shop', 'asmr-and-dopamine',
  'asmr-vs-white-noise', 'how-to-find-your-asmr-triggers', 'asmr-immunity',
  'asmr-and-introverts', 'asmr-placebo-or-real'
]

const aiFiller = ['furthermore','moreover','delve','leverage','utilize','foster','harness','embark','robust','seamless','holistic','paradigm','cornerstone','game-changer']
const jargon = ['parasympathetic','mirror neurons','auditory cortex','cortisol','neurological','physiological','cognitive','stimuli','bilateral']
const jargonMap = {
  'neurological': 'brain-based', 'physiological': 'physical', 'cognitive': 'mental',
  'stimuli': 'triggers', 'bilateral': 'left-right', 'parasympathetic': 'calming',
  'cortisol': 'stress hormone', 'auditory cortex': 'hearing center'
}

function fixEm(s) { return s.replace(/—/g, ', ').replace(/–/g, '-') }

function fixFatParas(html) {
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (match, content) => {
    const text = content.replace(/<[^>]+>/g, '')
    const sents = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
    if (sents.length <= 3 && text.length <= 280) return match
    const chunks = []
    let cur = ''
    for (const s of sents) {
      const candidate = cur ? cur + ' ' + s : s
      const cSents = candidate.split(/[.!?]+/).filter(x => x.trim().length > 5).length
      if (cur && (cSents > 3 || candidate.length > 280)) { chunks.push(cur.trim()); cur = s }
      else { cur = candidate }
    }
    if (cur.trim()) chunks.push(cur.trim())
    return chunks.map(c => `<p>${c}</p>`).join('\n')
  })
}

// Extract the HTML content from additionalHtml key regardless of JSON structure
function extractAdditionalHtml(raw) {
  raw = raw.replace(/^﻿/, '').trim()
  // Strip outer wrapping quotes if double-encoded
  if (raw.startsWith('"') && raw.endsWith('"')) {
    raw = JSON.parse(raw) // decode outer string
  }
  // Now find "additionalHtml": "..." — extract value between first <h2 and last >
  // Use regex to get the HTML content between the key and closing quote
  // Look for the h2 opening tag and grab everything to the end of the HTML
  const h2Start = raw.indexOf('<h2')
  if (h2Start === -1) { console.log('  No <h2 found'); return null }
  // Find the last HTML tag closing
  const htmlContent = raw.slice(h2Start)
  // Strip trailing " and JSON artifacts
  // Find the position of the last > followed by optional whitespace and then " or \n
  const lastClose = htmlContent.lastIndexOf('>')
  return fixEm(htmlContent.slice(0, lastClose + 1))
}

for (const slug of slugs) {
  const expandFile = `state/expand-${slug}.json`
  if (!fs.existsSync(expandFile)) { console.log(slug + ': no expand file'); continue }

  const raw = fs.readFileSync(expandFile, 'utf8')
  const additional = extractAdditionalHtml(raw)
  if (!additional) { console.log(slug + ': extraction failed'); continue }

  // Append to introHtml and fix fat paras
  data[slug].introHtml = fixFatParas((data[slug].introHtml || '') + '\n\n' + fixFatParas(additional))

  // Fix jargon everywhere
  for (const [bad, good] of Object.entries(jargonMap)) {
    const re = new RegExp('\\b' + bad + '\\b', 'gi')
    data[slug].introHtml = data[slug].introHtml.replace(re, good)
    if (data[slug].faqItems) {
      data[slug].faqItems = data[slug].faqItems.map(f => ({
        ...f,
        answer: (f.answer||'').replace(re, good),
        shortAnswer: (f.shortAnswer||'').replace(re, good)
      }))
    }
    if (data[slug].proTips) {
      data[slug].proTips = data[slug].proTips.map(t => t.replace(re, good))
    }
  }

  // Gate check
  const allText = [data[slug].introHtml||'',...(data[slug].faqItems||[]).map(b=>b.question+' '+b.answer),...(data[slug].proTips||[])].join(' ')
  const text = allText.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
  const words = text.split(/\s+/).filter(Boolean).length
  const emDashes = (text.match(/—/g)||[]).length
  const aiFound = aiFiller.filter(ph=>new RegExp('\\b'+ph+'\\b','i').test(text))
  const jargonFound = jargon.filter(ph=>new RegExp('\\b'+ph+'\\b','i').test(text))
  const metaOk = data[slug].metaDescription && data[slug].metaDescription.length<=160 && data[slug].metaDescription.includes('ASMR')
  const paras = (data[slug].introHtml||'').match(/<p[^>]*>[\s\S]*?<\/p>/g)||[]
  const fatParas = paras.filter(pg => { const t=pg.replace(/<[^>]+>/g,''); return t.split(/[.!?]+/).filter(s=>s.trim().length>5).length>4 || t.length>300 })
  const shortAnswerFails = (data[slug].faqItems||[]).filter(f => !f.shortAnswer || /<[a-z\/]/i.test(f.shortAnswer) || f.shortAnswer.split(/\s+/).length>50)
  const hasTakeaways = (data[slug].introHtml||'').includes('<h2>Key Takeaways</h2>')

  const issues = []
  if (words < 2000) issues.push('words:'+words)
  if (emDashes > 0) issues.push('em-dashes:'+emDashes)
  if (aiFound.length) issues.push('ai:'+aiFound.join(','))
  if (jargonFound.length) issues.push('jargon:'+jargonFound.join(','))
  if (!metaOk) issues.push('meta:bad')
  if (fatParas.length) issues.push('fatParas:'+fatParas.length)
  if (shortAnswerFails.length) issues.push('saFails:'+shortAnswerFails.length)
  if (!hasTakeaways) issues.push('noTakeaways')

  console.log(slug + ': ' + (issues.length === 0 ? 'PASS words:'+words : 'FAIL '+issues.join(' ')))
}

fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
console.log('\nAll merged and saved.')
