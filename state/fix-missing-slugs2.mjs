import fs from 'fs'
const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))

const aiFiller = ['furthermore','moreover','delve','leverage','utilize','foster','harness','embark','robust','seamless','holistic','paradigm','cornerstone','game-changer']
const jargon = ['parasympathetic','mirror neurons','auditory cortex','cortisol','neurological','physiological','cognitive','stimuli','bilateral']

function fixAllEmDashes(s) { return s.replace(/—/g, ', ').replace(/–/g, '-') }

// Fix asmr-tingles-not-working
{
  const p = data['asmr-tingles-not-working']
  // Fix em-dashes everywhere
  p.introHtml = fixAllEmDashes(p.introHtml)
  if (p.faqItems) p.faqItems = p.faqItems.map(f => ({
    ...f,
    answer: fixAllEmDashes(f.answer),
    shortAnswer: fixAllEmDashes(f.shortAnswer||'')
  }))
  if (p.proTips) p.proTips = p.proTips.map(fixAllEmDashes)

  // Fix the 2 fat paras by replacing them with split versions
  // Para: "The most common mismatches: trying roleplay..."  (len 347)
  p.introHtml = p.introHtml.replace(
    '<p>The most common mismatches: trying roleplay content when your triggers are sound-based, or pure sound content when your triggers are visual or social. Try each category separately, tapping, scratching, whispering, crinkling, page-turning, soft-spoken explanations, and personal attention videos. Give each a real test before ruling out a category.</p>',
    '<p>The most common mismatches: trying roleplay content when your triggers are sound-based, or pure sound content when your triggers are visual or social.</p>\n<p>Try each category separately: tapping, scratching, whispering, crinkling, page-turning, soft-spoken explanations, and personal attention videos. Give each a real test before ruling out a category.</p>'
  )
  // Para: "This is worth knowing because people..."  (len 317)
  p.introHtml = p.introHtml.replace(
    '<p>This is worth knowing because people in this situation often assume immunity and take a break, which does nothing. The response comes back when medication changes, not from rest. If you\'re on an SSRI or antihistamine and lost your ASMR response, expect it to return when your medication situation changes, not before.</p>',
    '<p>This is worth knowing because people in this situation often assume immunity and take a break, which does nothing.</p>\n<p>The response comes back when medication changes, not from rest. If you\'re on an SSRI or antihistamine and lost your ASMR response, expect it to return when your medication situation changes, not before.</p>'
  )

  // Add ~100w more to reach 2000
  p.introHtml += `

<h2>The Right Headphones Make a Difference</h2>
<p>ASMR is engineered for binaural audio. Without headphones, stereo positioning collapses to mono and the spatial effect disappears.</p>
<p>You don't need expensive headphones. Any pair that seals around your ears works. The seal matters more than the price. Earbuds work if they fit your ears well. Over-ear headphones with cushioned cups are the best option for lying down without pressure.</p>`
}

// Fix what-is-asmr-roleplay
{
  const p = data['what-is-asmr-roleplay']
  p.introHtml = fixAllEmDashes(p.introHtml)
  if (p.faqItems) p.faqItems = p.faqItems.map(f => ({
    ...f,
    answer: fixAllEmDashes(f.answer),
    shortAnswer: fixAllEmDashes(f.shortAnswer||'')
  }))
  if (p.proTips) p.proTips = p.proTips.map(fixAllEmDashes)

  // Fix fat para: "The difference matters because..." (len 328)
  p.introHtml = p.introHtml.replace(
    '<p>The difference matters because the brain processes them differently. A tapping sound triggers through the auditory pathway. A doctor\'s examination roleplay triggers through the social attention pathway. Both produce relaxation but through different mechanisms, which is why some people respond strongly to one and not the other.</p>',
    '<p>The difference matters because the brain processes them differently. A tapping sound triggers through the auditory pathway. A doctor\'s examination roleplay triggers through the social attention pathway.</p>\n<p>Both produce relaxation but through different mechanisms, which is why some people respond strongly to one and not the other.</p>'
  )

  // Add ~200w more to reach 2000
  p.introHtml += `

<h2>What to Expect the First Time</h2>
<p>First-time viewers often feel nothing. This is normal. Your brain doesn't know yet what to make of the format, and the novelty creates low-level alertness that blocks relaxation.</p>
<p>Give it three or four sessions before judging. The people who report the strongest ASMR responses from roleplay are almost never first-session converts. The response builds as your brain learns to predict the pacing and stop analyzing it.</p>
<p>Start with a scenario that feels naturally calming to you. A barber visit feels very different from a cranial nerve exam, even though both are in the personal attention category. Match the scenario to your comfort level with physical and social closeness.</p>`
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
