import fs from 'fs'
const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json','utf8'))

const fixes = {
  'roleplay': [['take your', 'try a']],
  'asmr-for-tinnitus': [['dive into', 'explore']],
  '10-hour-asmr': [['ensuring the', 'keeping the']],
  'asmr-for-focus': [['when it comes to', 'for']],
  'fabric-sounds': [['when it comes to', 'for']],
  'fire-crackling': [['when it comes to', 'for']],
  'asmr-cooking-show': [['at the end of the day', 'ultimately']],
}

function replaceAll(str, bad, good) {
  return str.split(bad).join(good)
}

for (const [slug, replacements] of Object.entries(fixes)) {
  const p = data[slug]
  if (!p) { console.log('MISSING:', slug); continue }
  for (const [bad, good] of replacements) {
    for (const field of ['introHtml','metaDescription']) {
      if (p[field]) p[field] = replaceAll(p[field], bad, good)
    }
    for (const faq of (p.faqItems||[])) {
      for (const f of ['question','answer','shortAnswer']) {
        if (faq[f]) faq[f] = replaceAll(faq[f], bad, good)
      }
    }
    for (let i = 0; i < (p.proTips||[]).length; i++) {
      p.proTips[i] = replaceAll(p.proTips[i], bad, good)
    }
  }
  console.log(slug + ': fixed')
}

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(data,null,2))
console.log('Done')
