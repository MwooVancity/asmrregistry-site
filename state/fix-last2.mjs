import fs from 'fs'
const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))

// Fix seamless in asmr-rain-on-tent
data['asmr-rain-on-tent'].introHtml = data['asmr-rain-on-tent'].introHtml.replace(/\bseamless\b/gi, 'smooth')

// Add section to asmr-rain-on-tent (~120w)
data['asmr-rain-on-tent'].introHtml += `

<h2>When to Skip the Video and Go Straight to Audio</h2>
<p>Most tent rain ASMR is published as video but you don't need to watch it.</p>
<p>Once you've found a recording that works, add it to a playlist and play audio-only with your screen off. Screen brightness activates alertness, even at its lowest setting.</p>
<p>If you're on YouTube, enable background play or use a third-party audio app. The recording sounds identical without the visual, and your sleep improves when your screen isn't on.</p>
<p>This also solves the dead battery problem. Playing audio-only without the display active uses a fraction of the power. An 8-hour loop won't drain your phone.</p>`

// Add section to asmr-coffee-shop (~80w)
data['asmr-coffee-shop'].introHtml += `

<h2>When Coffee Shop Sounds Stop Working</h2>
<p>If your usual recording stops blocking distraction, switch environment: library ambience, bookshop sounds, or rain on a window in a quiet room.</p>
<p>The masking principle is the same, but novelty resets your attention span for it.</p>
<p>Rotate your background audio every 2-3 weeks. If you've used the same recording for 3 months, it's invisible to you. Your brain has stopped processing it as a signal and started skipping it entirely. New audio reinstates the effect.</p>`

// Verify both
const aiFiller = ['furthermore','moreover','delve','leverage','utilize','foster','harness','embark','robust','seamless','holistic','paradigm','cornerstone','game-changer']
const jargon = ['parasympathetic','mirror neurons','auditory cortex','cortisol','neurological','physiological','cognitive','stimuli','bilateral']

for (const slug of ['asmr-rain-on-tent', 'asmr-coffee-shop']) {
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
  console.log(slug + ': ' + (issues.length===0?'PASS words:'+words:'FAIL '+issues.join(' ')))
}

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(data, null, 2), 'utf8')
console.log('Saved.')
