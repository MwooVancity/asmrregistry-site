import fs from 'fs'
const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))

const aiFiller = ['furthermore','moreover','delve','leverage','utilize','foster','harness','embark','robust','seamless','holistic','paradigm','cornerstone','game-changer']
const jargon = ['parasympathetic','mirror neurons','auditory cortex','cortisol','neurological','physiological','cognitive','stimuli','bilateral']

const p = data['types-of-asmr']

// Split fat para 1: "Intentional ASMR..."
p.introHtml = p.introHtml.replace(
  "<p>Intentional ASMR is designed around known triggers. Unintentional ASMR captures people who weren't trying to produce it, and those recordings frequently hit harder because the person isn't performing. The naturalness of the voice and pacing is different from someone who knows they're making ASMR content.</p>",
  "<p>Intentional ASMR is designed around known triggers. The creators know what works and produce it deliberately.</p>\n<p>Unintentional ASMR captures people who weren't trying to produce it, and those recordings frequently hit harder because the person isn't performing. The naturalness of the voice and pacing is different from someone who knows they're making ASMR content.</p>"
)

// Split fat para 2: "Rain, stream water..."
p.introHtml = p.introHtml.replace(
  "<p>Rain, stream water, and forest ambience work differently depending on recording location and microphone placement. Rain recorded on a tent canvas sounds different from rain on a window, which sounds different from rain on leaves. Calling them all \"rain ASMR\" misses the distinction that actually matters for your response.</p>",
  "<p>Rain, stream water, and forest ambience work differently depending on recording location and microphone placement.</p>\n<p>Rain recorded on a tent canvas sounds different from rain on a window, which sounds different from rain on leaves. Calling them all \"rain ASMR\" misses the distinction that actually matters for your response.</p>"
)

// Add ~400w more to reach 2000
p.introHtml += `

<h2>Choosing by Use Case, Not Just Preference</h2>
<p>Different trigger types produce different outcomes. Knowing your use case helps narrow the category before you start searching.</p>
<p>For sleep: whispering, slow tapping on soft surfaces, and nature ambience work best. These have lower frequency content and predictable rhythm that reduces alertness without demanding attention.</p>
<p>For study and focus: crinkling, keyboard sounds, and writing sounds work better. The unpredictable timing keeps a low level of attention engaged without pulling focus away from the task.</p>
<p>For anxiety relief: roleplay with a calm character and personal attention elements activates the social pathway. This works because the brain processes simulated social safety signals similarly to real ones.</p>
<p>For headache and migraine: very soft brushing sounds, gentle rain, and whisper content at low volume. Avoid sharp tapping or crinkling, which can amplify rather than reduce head pain.</p>
<h2>When to Stop Searching and Start Rotating</h2>
<p>ASMR immunity builds faster on single triggers than on rotation. If you've used the same type for three months, switching to a completely different category is more effective than finding a new creator in the same style.</p>
<p>A simple rotation: one week of sound-only content, one week of nature ambience, one week of roleplay, repeat. This prevents habituation from building in any single pathway and keeps the response strong over months of regular use.</p>
<p>You don't need to permanently abandon types that have gotten weak. Immunity from overuse reverses with a break. Two to three weeks away from a trigger type usually restores the response. The rotation approach lets you use multiple types in cycle and keeps each one fresh without requiring long breaks from ASMR entirely.</p>`

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
