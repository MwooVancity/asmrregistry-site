import fs from 'fs'
const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))

const aiFiller = ['furthermore','moreover','delve','leverage','utilize','foster','harness','embark','robust','seamless','holistic','paradigm','cornerstone','game-changer']
const jargon = ['parasympathetic','mirror neurons','auditory cortex','cortisol','neurological','physiological','cognitive','stimuli','bilateral']

// Fix asmr-tingles-not-working: split fat para + add a few words
{
  const p = data['asmr-tingles-not-working']
  p.introHtml = p.introHtml.replace(
    "<p>You don't need expensive headphones. Any pair that seals around your ears works. The seal matters more than the price. Earbuds work if they fit your ears well. Over-ear headphones with cushioned cups are the best option for lying down without pressure.</p>",
    "<p>You don't need expensive headphones. Any pair that seals around your ears works. The seal matters more than the price.</p>\n<p>Earbuds work if they fit your ears well. Over-ear headphones with cushioned cups are the best option for lying down without discomfort. If you're using them in bed, look for a low-profile design that doesn't press into your ear when you're on your side.</p>"
  )
}

// Fix what-is-asmr-roleplay: add ~70w more
{
  const p = data['what-is-asmr-roleplay']
  p.introHtml += `

<h2>Roleplay Without the Personal Attention Element</h2>
<p>Not all ASMR roleplay involves someone interacting directly with you. Some creators use a third-person observer format, where you watch a scene unfold without being a participant. Library ambience roleplay, coffee shop character studies, and train journey narratives fall into this category.</p>
<p>These work well for people who find personal attention scenarios too intense or too social. The sounds and pacing are the same. The difference is whether you're in the scene or watching it.</p>`
}

// Gate check both
for (const slug of ['asmr-tingles-not-working','what-is-asmr-roleplay']) {
  const p = data[slug]
  const allText = [p.introHtml||'',...(p.faqItems||[]).map(b=>b.question+' '+b.answer),...(p.proTips||[])].join(' ')
  const text = allText.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')
  const words = text.split(/\s+/).filter(Boolean).length
  const emDashes = (text.match(/—/g)||[]).length
  const aiFound = aiFiller.filter(ph=>new RegExp('\\b'+ph+'\\b','i').test(text))
  const jargonFound = jargon.filter(ph=>new RegExp('\\b'+ph+'\\b','i').test(text))
  const metaOk = p.metaDescription && p.metaDescription.length<=160 && p.metaDescription.includes('ASMR')
  const paras = (p.introHtml||'').match(/<p[^>]*>[\s\S]*?<\/p>/g)||[]
  const fatParas = paras.filter(pg=>{const t=pg.replace(/<[^>]+>/g,'');return t.split(/[.!?]+/).filter(s=>s.trim().length>5).length>4||t.length>300})
  const shortAnswerFails = (p.faqItems||[]).filter(f=>!f.shortAnswer||/<[a-z\/]/i.test(f.shortAnswer)||f.shortAnswer.split(/\s+/).length>50)
  const hasTakeaways = (p.introHtml||'').includes('<h2>Key Takeaways</h2>')
  const issues = []
  if (words<2000) issues.push('words:'+words)
  if (emDashes>0) issues.push('em-dashes:'+emDashes)
  if (aiFound.length) issues.push('ai:'+aiFound.join(','))
  if (jargonFound.length) issues.push('jargon:'+jargonFound.join(','))
  if (!metaOk) issues.push('meta:bad')
  if (fatParas.length) issues.push('fatParas:'+fatParas.length)
  if (shortAnswerFails.length) issues.push('saFails:'+shortAnswerFails.length)
  if (!hasTakeaways) issues.push('noTakeaways')
  console.log(slug+': '+(issues.length===0?'PASS words:'+words:'FAIL '+issues.join(' ')))
}

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(data, null, 2), 'utf8')
console.log('Saved.')
