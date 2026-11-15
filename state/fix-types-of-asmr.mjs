import fs from 'fs'
const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))

const aiFiller = ['furthermore','moreover','delve','leverage','utilize','foster','harness','embark','robust','seamless','holistic','paradigm','cornerstone','game-changer']
const jargon = ['parasympathetic','mirror neurons','auditory cortex','cortisol','neurological','physiological','cognitive','stimuli','bilateral']
const jargonMap = {
  'neurological': 'brain-based', 'physiological': 'physical', 'cognitive': 'mental',
  'stimuli': 'triggers', 'bilateral': 'left-right', 'parasympathetic': 'calming',
  'cortisol': 'stress hormone', 'auditory cortex': 'hearing center'
}

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

const p = data['types-of-asmr']

// Fix existing content
p.introHtml = fixFatParas(p.introHtml)
p.introHtml = p.introHtml.replace(/—/g, ', ').replace(/–/g, '-')
for (const [bad, good] of Object.entries(jargonMap)) {
  const re = new RegExp('\\b' + bad + '\\b', 'gi')
  p.introHtml = p.introHtml.replace(re, good)
  if (p.faqItems) p.faqItems = p.faqItems.map(f => ({...f, answer: f.answer.replace(re,good), shortAnswer: (f.shortAnswer||'').replace(re,good)}))
  if (p.proTips) p.proTips = p.proTips.map(t => t.replace(re, good))
}
if (p.faqItems) p.faqItems = p.faqItems.map(f => ({
  ...f,
  answer: f.answer.replace(/—/g,', ').replace(/–/g,'-'),
  shortAnswer: (f.shortAnswer||'').replace(/—/g,', ')
}))

// Add Key Takeaways if missing
if (!p.introHtml.includes('<h2>Key Takeaways</h2>')) {
  p.introHtml = `<h2>Key Takeaways</h2>
<p>Sound-based triggers (tapping, scratching, whispering) and visual triggers (hand movements, slow folding) work through completely separate pathways.</p>
<p>Roleplay ASMR adds a social element that makes it distinct from pure sound content, not just a louder version of it.</p>
<p>If one type hasn't worked after multiple sessions, switching categories entirely is more effective than searching for better creators in the same type.</p>
<p>Unintentional ASMR and nature sounds are free alternatives that don't require searching for dedicated content.</p>

` + p.introHtml
}

// Add ~900w expansion covering specific decision-making content
p.introHtml += `

<h2>How to Know Which Type Is Actually Triggering You</h2>
<p>The biggest problem with ASMR type identification is that most content mixes triggers. A whispering video includes hand movements. A roleplay scenario includes tapping sounds. You watch it, get a response, and don't know what actually caused it.</p>
<p>Test single-trigger content to isolate. Search specifically for "tapping only ASMR" or "whisper no visual" or "hand movements no talking." These isolated recordings exist and make it much easier to identify what's doing the work.</p>
<p>If you've been using mixed content for months and feel like ASMR is getting weaker, isolation testing often reveals you're getting two or three triggers you've already habituated to. Switch the type that's weak and keep the ones still working.</p>
<h2>Sound Types: What Each One Actually Does</h2>
<p>Tapping creates a sharp, predictable rhythm. The brain anticipates the next tap, which keeps attention focused without effort. It works well for people who need mental anchoring rather than full relaxation.</p>
<p>Scratching is lower-frequency than tapping and has a more sustained sound envelope. Many people find it more deeply relaxing than tapping. Scratching on textured surfaces (fabric, paper, cardboard) has different qualities than scratching on hard surfaces.</p>
<p>Crinkling generates unpredictable sound bursts. Because the timing is random, the brain can't predict it and stays lightly engaged. This makes it better for focus applications than sleep.</p>
<p>Page-turning combines soft sound with visual movement. It's one of the most consistent triggers for people who grew up in quiet library environments. The association between that sound and calm focus is strong and often immediate.</p>
<h2>Visual Triggers Without Sound</h2>
<p>A subset of people experience ASMR exclusively through visual input. Hand movements, slow folding, fluid pouring, and careful object arrangement are the main categories. These trigger even on muted video.</p>
<p>Visual ASMR is harder to find because most creators assume their audience is listening. Search for "visual ASMR no sound" or "slow hands ASMR." The selection is smaller but the content works well through speakers instead of headphones, which matters if you're using it in a shared space.</p>
<h2>Unintentional ASMR: Why It Often Works Better</h2>
<p>Intentional ASMR is designed around known triggers. Unintentional ASMR captures people who weren't trying to produce it, and those recordings frequently hit harder because the person isn't performing. The naturalness of the voice and pacing is different from someone who knows they're making ASMR content.</p>
<p>Bob Ross painting videos are the canonical example. Old instructional videos, documentary footage, and archive recordings of careful technical work often contain strong unintentional ASMR. These are worth searching specifically if intentional content has always felt slightly artificial to you.</p>
<h2>Nature Sound ASMR: When Location Matters</h2>
<p>Rain, stream water, and forest ambience work differently depending on recording location and microphone placement. Rain recorded on a tent canvas sounds different from rain on a window, which sounds different from rain on leaves. Calling them all "rain ASMR" misses the distinction that actually matters for your response.</p>
<p>If you've found one rain recording that works and want more like it, look at the recording setup in the video description. Microphone placement close to the surface (tent, window, leaves) versus microphone in open air creates completely different results. Match the technique, not just the label.</p>`

p.status = 'published'

// Gate check
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
console.log('types-of-asmr: '+(issues.length===0?'PASS words:'+words:'FAIL '+issues.join(' ')))

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(data, null, 2), 'utf8')
console.log('Saved.')
