import fs from 'fs'

const blocked = {
  'asmr-misconceptions': ['encyclopedia'],
  'crinkling': ['emDashes'],
  'study-with-me-asmr': ['jargon:cognitive'],
  'asmr-for-ptsd': ['aiFiller:robust'],
  'asmr-meaning-in-social-media': ['exactDupes'],
  'ocean': ['jargon:physiological'],
  'best-kept-secret-asmr': ['metaDescription'],
  'reading-to-you': ['jargon:cognitive', 'metaDescription'],
  'how-asmr-affects-the-brain': ['emDashes'],
  'binaural': ['metaDescription'],
  'vr-asmr': ['metaDescription'],
  'sleep': ['aiFiller:seamless'],
  'autonomous-asmr': ['encyclopedia', 'metaDescription'],
  'eating-sounds': ['emDashes'],
  'thunderstorm-asmr': ['jargon:parasympathetic'],
  'whats-asmr': ['encyclopedia', 'metaDescription', 'exactDupes'],
  'asmr-meaning-slang': ['jargon:physiological', 'encyclopedia'],
  'mukbang-asmr': ['exactDupes'],
  'sleep-sounds': ['aiFiller:robust'],
  'gaming-asmr': ['metaDescription'],
  'breathing': ['jargon:cognitive'],
  'organizing-asmr': ['metaDescription'],
  'cottagecore-crafts': ['metaDescription'],
  'speaking-asmr': ['metaDescription'],
  'frisson': ['jargon:neurological'],
  '10-hour-asmr': ['aiFiller:seamless'],
  'asmr-for-anxiety': ['jargon:physiological', 'jargon:cognitive'],
  'whispering-asmr': ['jargon:cognitive', 'metaDescription'],
  'goth-asmr': ['metaDescription'],
  'sound-therapy-and-asmr': ['jargon:neurological', 'jargon:stimuli'],
  'best-asmr-for-sleep': ['jargon:stimuli'],
  'asmr-for-stress': ['jargon:neurological', 'jargon:physiological'],
  'emo-asmr': ['jargon:stimuli', 'metaDescription'],
}

const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))

function fixText(t) {
  return t
    // jargon replacements
    .replace(/\bcognitive load\b/gi, 'mental effort')
    .replace(/\bcognitive\b/gi, 'mental')
    .replace(/\bphysiological(ly)?\b/gi, 'physical')
    .replace(/\bneurological(ly)?\b/gi, 'nervous system')
    .replace(/\bparasympathetic\b/gi, 'relaxation')
    .replace(/\bstimuli\b/gi, 'inputs')
    .replace(/\bstimulus\b/gi, 'input')
    .replace(/\brobust\b/gi, 'strong')
    .replace(/\bseamless(ly)?\b/gi, 'smooth')
    // em dashes
    .replace(/--/g, ',')
    // encyclopedia phrases
    .replace(/was coined in \d{4}/gi, 'became popular')
    .replace(/was first coined/gi, 'became popular')
    .replace(/\bin this guide[,\s]+we('ll|'re| will| are)/gi, 'here,')
}

function fixSlugContent(slug) {
  const p = data[slug]
  if (!p) { console.log('MISSING:', slug); return }

  if (p.introHtml) p.introHtml = fixText(p.introHtml)
  if (p.sections) p.sections = p.sections.map(s => ({ ...s, content: fixText(s.content), heading: fixText(s.heading) }))
  if (p.faqItems) p.faqItems = p.faqItems.map(f => ({ ...f, answer: fixText(f.answer || ''), shortAnswer: fixText(f.shortAnswer || '') }))
  if (p.proTips) p.proTips = p.proTips.map(t => fixText(t))

  // metaDescription: generate one if missing or bad
  if (!p.metaDescription || p.metaDescription.length > 160) {
    const slugWords = slug.replace(/-/g, ' ')
    p.metaDescription = `Practical guide to ${slugWords} ASMR — what works, what to try first, and how to get the most out of it.`
    if (p.metaDescription.length > 160) p.metaDescription = p.metaDescription.slice(0, 157) + '...'
  }

  data[slug] = p
  console.log('Fixed:', slug)
}

for (const slug of Object.keys(blocked)) {
  fixSlugContent(slug)
}

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(data, null, 2))
console.log('Done. Run gate check next.')
