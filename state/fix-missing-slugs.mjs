import fs from 'fs'
const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))

const aiFiller = ['furthermore','moreover','delve','leverage','utilize','foster','harness','embark','robust','seamless','holistic','paradigm','cornerstone','game-changer']
const jargon = ['parasympathetic','mirror neurons','auditory cortex','cortisol','neurological','physiological','cognitive','stimuli','bilateral']

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

// --- fix asmr-tingles-not-working ---
{
  const p = data['asmr-tingles-not-working']
  // Fix em-dashes and jargon
  p.introHtml = p.introHtml.replace(/—/g, ', ').replace(/–/g, '-').replace(/\bstimuli\b/gi, 'triggers')
  if (p.faqItems) p.faqItems = p.faqItems.map(f => ({
    ...f,
    answer: f.answer.replace(/—/g,', ').replace(/–/g,'-').replace(/\bstimuli\b/gi,'triggers'),
    shortAnswer: (f.shortAnswer||'').replace(/—/g,', ').replace(/\bstimuli\b/gi,'triggers')
  }))
  p.introHtml = fixFatParas(p.introHtml)

  // Add ~500w to reach 2000w
  p.introHtml += `

<h2>Rebuilding Your ASMR Response After Immunity</h2>
<p>Immunity feels permanent but isn't. Your brain habituated, not broke. The mechanism is the same one that makes your commute feel shorter after a month or background music disappear after ten minutes.</p>
<p>The fix is counter-intuitive: stop. Take a full two-week break from all ASMR content, including background use while working. The break allows prediction pathways to fade.</p>
<p>When you return, use content you've never heard before, not your old favorites. New content hasn't been predicted yet. Binaural recordings through headphones on the first few sessions back will give you the strongest signal possible while your response is still fresh.</p>
<p>Do this in the evening lying down, not at a desk. Environmental conditions matter more than most people expect. The same recording that produced nothing at 2pm on a bright Tuesday will hit differently at 10pm in a dark room.</p>
<h2>When the Problem Is the Recording, Not You</h2>
<p>Not all ASMR triggers work for everyone. If you've never felt tingles from any content after 10+ focused sessions, you may simply respond to different input than what you tested.</p>
<p>The most common mismatches: trying roleplay content when your triggers are sound-based, or pure sound content when your triggers are visual or social. Try each category separately, tapping, scratching, whispering, crinkling, page-turning, soft-spoken explanations, and personal attention videos. Give each a real test before ruling out a category.</p>
<p>Some people never experience ASMR tingles. That's real and not fixable. But relaxation without tingles is still a valid outcome. Most people who believe they're non-responders are actually testing the wrong trigger type in the wrong conditions.</p>
<h2>Medications That Suppress ASMR Response</h2>
<p>SSRIs and antihistamines blunt emotional and physical responses including ASMR. If you started medication and lost your response, the drug is likely blocking it. A break won't help in this case.</p>
<p>This is worth knowing because people in this situation often assume immunity and take a break, which does nothing. The response comes back when medication changes, not from rest. If you're on an SSRI or antihistamine and lost your ASMR response, expect it to return when your medication situation changes, not before.</p>`
}

// --- fix what-is-asmr-roleplay ---
{
  const p = data['what-is-asmr-roleplay']
  p.introHtml = p.introHtml.replace(/—/g, ', ').replace(/–/g, '-')
  if (p.faqItems) p.faqItems = p.faqItems.map(f => ({
    ...f,
    answer: f.answer.replace(/—/g,', ').replace(/–/g,'-'),
    shortAnswer: (f.shortAnswer||'').replace(/—/g,', ')
  }))
  p.introHtml = fixFatParas(p.introHtml)

  // Add ~500w to reach 2000w
  p.introHtml += `

<h2>How ASMR Roleplay Differs from Standard ASMR</h2>
<p>Standard ASMR content focuses on isolated sounds. Roleplay ASMR adds a character, a scenario, and social context to those sounds.</p>
<p>The difference matters because the brain processes them differently. A tapping sound triggers through the auditory pathway. A doctor's examination roleplay triggers through the social attention pathway. Both produce relaxation but through different mechanisms, which is why some people respond strongly to one and not the other.</p>
<p>If standard ASMR hasn't worked for you, roleplay is worth trying. And if roleplay feels too intense or interactive, pure sound content is the lower-stimulation alternative.</p>
<h2>Finding Roleplay Content That Works</h2>
<p>The biggest variable is scenario. Common formats include doctor visits, spa treatments, hair appointments, library check-ins, and personal shopping sessions. What they share: a calm environment, unhurried pacing, and an attentive character focused on you.</p>
<p>Search on YouTube for the scenario plus ASMR. Start with a common one like hair wash roleplay or eye exam ASMR to get a baseline. Then move toward scenarios that match your personal comfort level with social interaction.</p>
<p>Creator voice matters as much as scenario. Try the same scenario from three different creators before deciding the scenario doesn't work. The production style, pacing, and vocal tone vary enough that one version might land where another doesn't.</p>
<h2>Using Roleplay ASMR for Sleep</h2>
<p>Roleplay works better for falling asleep than staying asleep. The narrative and character voice hold attention, which makes it easier to transition out of the day's mental chatter. But once you're deeply asleep, the changing voices and scenario beats can become disruptive.</p>
<p>A practical approach: use roleplay to fall asleep, then let it auto-stop or switch to a long ambient loop for the rest of the night. Most ASMR creators publish both formats specifically because listeners use them this way.</p>`
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
