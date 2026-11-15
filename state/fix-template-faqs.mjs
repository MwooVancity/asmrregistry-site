import fs from 'fs'

const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'))

// For each slug: map template question pattern → better specific question
// Template patterns: "How long should I listen to X ASMR?", "Who does X ASMR work best for?",
//   "What's the difference between good and bad X ASMR?", "Should I use headphones for X ASMR?"
const fixes = {
  'massage': [
    ['How long should I listen to massage ASMR?', 'What scalp massage techniques feel most realistic in ASMR?'],
    ["Who does massage ASMR work best for?", 'Does massage ASMR help relieve tension headaches and neck pain?'],
    ["What's the difference between good and bad massage ASMR?", 'What makes a massage ASMR video feel realistic versus obviously scripted?'],
    ['Should I use headphones for massage ASMR?', 'Why does binaural massage ASMR feel more immersive than standard recordings?'],
  ],
  'slime': [
    ['How long should I listen to slime ASMR?', 'What slime textures create the most satisfying ASMR sounds?'],
    ['Who does slime ASMR work best for?', 'Does watching slime ASMR create tingles the same way listening does?'],
    ["What's the difference between good and bad slime ASMR?", 'What is the difference between crunchy slime and fluffy slime sounds?'],
    ['Should I use headphones for slime ASMR?', 'Why do slime ASMR creators use close-mic setups for better audio?'],
  ],
  'personal-attention': [
    ['How long should I listen to personal attention ASMR?', 'What types of personal attention triggers feel the most realistic?'],
    ['Who does personal attention ASMR work best for?', 'Why does personal attention ASMR feel more immersive than ambient sound formats?'],
    ["What's the difference between good and bad personal attention ASMR?", 'What makes a personal attention video feel authentic rather than overly scripted?'],
    ['Should I use headphones for personal attention ASMR?', 'How does binaural audio change the experience of personal attention ASMR?'],
  ],
  'sleep': [
    ['How long should I listen to sleep ASMR?', 'How does ASMR affect the transition from wakefulness to sleep?'],
    ['Who does sleep ASMR work best for?', 'Does ASMR work better for sleep onset or for people who wake during the night?'],
    ["What's the difference between good and bad sleep ASMR?", 'What makes a sleep ASMR video stay relaxing for hours without jarring you awake?'],
    ['Should I use headphones for sleep ASMR?', 'Can you fall asleep safely while wearing headphones for ASMR?'],
  ],
  'asmr-games': [
    ['How long should I listen to asmr games ASMR?', 'What video game genres have the most naturally soothing ASMR sounds?'],
    ['Who does asmr games ASMR work best for?', 'Do gaming ASMR videos mix gameplay footage with intentional trigger sounds?'],
    ["What's the difference between good and bad asmr games ASMR?", 'What makes a gaming ASMR video relaxing rather than stimulating?'],
    ['Should I use headphones for asmr games ASMR?', 'How does gaming headset audio compare to binaural mics for ASMR content?'],
  ],
  'kids': [
    ['How long should I listen to kids ASMR?', 'What ASMR formats are most appropriate for children?'],
    ['Who does kids ASMR work best for?', 'At what age do children typically start responding to ASMR?'],
    ["What's the difference between good and bad kids ASMR?", 'What distinguishes child-appropriate ASMR from adult-focused content?'],
    ['Should I use headphones for kids ASMR?', 'Is it safe for children to use headphones with ASMR videos?'],
  ],
  'unintentional-asmr': [
    ['How long should I listen to unintentional asmr ASMR?', 'What makes a real-life video qualify as genuine unintentional ASMR?'],
    ['Who does unintentional asmr ASMR work best for?', 'Why do some people prefer unintentional ASMR over scripted videos?'],
    ["What's the difference between good and bad unintentional asmr ASMR?", 'How do you spot videos designed to seem unintentional versus actual unintentional ASMR?'],
    ['Should I use headphones for unintentional asmr ASMR?', 'Do old unintentional ASMR videos hold up as well as modern intentional recordings?'],
  ],
  'ocean': [
    ['How long should I listen to ocean ASMR?', 'What is the difference between ocean wave ASMR and white noise ocean recordings?'],
    ['Who does ocean ASMR work best for?', 'Why do ocean sounds work better for sleep than other nature ASMR for some people?'],
    ["What's the difference between good and bad ocean ASMR?", 'Does binaural ocean ASMR sound noticeably different from standard stereo recordings?'],
    ['Should I use headphones for ocean ASMR?', 'Can ocean ASMR produce the same physiological calm as being near the actual ocean?'],
  ],
  'scratching': [
    ['How long should I listen to scratching ASMR?', 'What surfaces produce the most satisfying scratching sounds in ASMR?'],
    ['Who does scratching ASMR work best for?', 'Why does the sound of fingernails scratching create tingles more reliably than other triggers?'],
    ["What's the difference between good and bad scratching ASMR?", 'What distinguishes gentle scratching ASMR from abrasive sounds that feel unpleasant?'],
    ['Should I use headphones for scratching ASMR?', 'How does mic placement affect how scratching sounds are captured in close-mic recordings?'],
  ],
  'sand': [
    ['How long should I listen to sand ASMR?', 'What is the difference between kinetic sand and regular sand ASMR sounds?'],
    ['Who does sand ASMR work best for?', 'Why do sand sounds produce a more sustained tingle response than sharp trigger sounds?'],
    ["What's the difference between good and bad sand ASMR?", 'What makes some sand ASMR recordings more tingle-inducing than others?'],
    ['Should I use headphones for sand ASMR?', 'Does sand ASMR work as well through speakers as through headphones?'],
  ],
  'cooking': [
    ['How long should I listen to cooking ASMR?', 'What cooking sounds are most reliably relaxing in ASMR videos?'],
    ['Who does cooking ASMR work best for?', 'Why does combining chopping, sizzling, and stirring work so well for ASMR?'],
    ["What's the difference between good and bad cooking ASMR?", 'What distinguishes an intentional cooking ASMR video from a regular cooking channel?'],
    ['Should I use headphones for cooking ASMR?', 'Does binaural cooking ASMR create a stronger relaxation response than standard stereo?'],
  ],
  'hair-play': [
    ['How long should I listen to hair play ASMR?', 'What scalp and hair sounds create the strongest ASMR tingles?'],
    ['Who does hair play ASMR work best for?', 'Why does hair brushing rank so consistently high in ASMR trigger preference?'],
    ["What's the difference between good and bad hair play ASMR?", 'What makes hair play ASMR feel personal and immersive versus clinical?'],
    ['Should I use headphones for hair play ASMR?', 'How does in-ear audio change the experience of hair brushing and scalp-touching ASMR?'],
  ],
  'headache': [
    ['How long should I listen to headache ASMR?', 'What ASMR triggers are most effective for tension headache relief?'],
    ['Who does headache ASMR work best for?', 'Why does ASMR help some people with headaches but worsen them for others?'],
    ["What's the difference between good and bad headache ASMR?", 'What separates ASMR designed for headache relief from general relaxation formats?'],
    ['Should I use headphones for headache ASMR?', 'Can wearing headphones make a headache worse, and what are the alternatives?'],
  ],
  'best-asmr-videos': [
    ['How long should I listen to best asmr videos ASMR?', 'What criteria separate a high-quality ASMR video from an average one?'],
    ['Who does best asmr videos ASMR work best for?', 'Why do some viewers respond better to long-form ASMR than short clips?'],
    ["What's the difference between good and bad best asmr videos ASMR?", 'What makes the best ASMR videos consistently appear in recommendations over others?'],
    ['Should I use headphones for best asmr videos ASMR?', 'Do binaural-recorded ASMR videos create measurably better tingle responses than mono?'],
  ],
  'what-is-asmr-massage': [
    ['How long should I listen to what is asmr massage ASMR?', 'What physical sensations define the ASMR tingle response during massage videos?'],
    ['Who does what is asmr massage ASMR work best for?', 'How does ASMR massage differ from actual physical massage in relaxation effects?'],
    ["What's the difference between good and bad what is asmr massage ASMR?", 'What makes an ASMR massage video feel more realistic than generic wellness content?'],
    ['Should I use headphones for what is asmr massage ASMR?', 'Why is proximity a key factor in how convincing ASMR massage sounds feel?'],
  ],
  'how-to-make-asmr-videos': [
    ['How long should I listen to how to make asmr videos ASMR?', 'What microphone techniques create the most realistic binaural ASMR recordings?'],
    ['Who does how to make asmr videos ASMR work best for?', 'How much does equipment matter versus technique when starting an ASMR channel?'],
    ["What's the difference between good and bad how to make asmr videos ASMR?", 'What editing mistakes ruin an otherwise good ASMR recording?'],
    ['Should I use headphones for how to make asmr videos ASMR?', 'Why does microphone placement affect ASMR production quality more than almost any other factor?'],
  ],
  'is-asmr-good-for-you': [
    ['How long should I listen to is asmr good for you ASMR?', 'What does current research say about ASMR effects on heart rate and stress hormones?'],
    ['Who does is asmr good for you ASMR work best for?', 'Are there documented cases where ASMR has negative effects on mental health?'],
    ["What's the difference between good and bad is asmr good for you ASMR?", 'What is the difference between healthy ASMR use and unhealthy dependence on it?'],
    ['Should I use headphones for is asmr good for you ASMR?', 'Does watching ASMR daily have cumulative benefits or does the relaxation effect plateau?'],
  ],
  'sleep-stories': [
    ['How long should I listen to sleep stories ASMR?', 'What voice characteristics make a sleep story most effective for falling asleep?'],
    ['Who does sleep stories ASMR work best for?', 'How do ASMR sleep stories differ from traditional audiobook narration for sleep?'],
    ["What's the difference between good and bad sleep stories ASMR?", 'What story content works better for sleep — fantasy, nature, or mundane everyday tasks?'],
    ['Should I use headphones for sleep stories ASMR?', 'Can you listen to ASMR sleep stories through a pillow speaker as effectively as headphones?'],
  ],
  'fabric-sounds': [
    ['How long should I listen to fabric sounds ASMR?', 'What fabric textures create the most satisfying ASMR sounds?'],
    ['Who does fabric sounds ASMR work best for?', 'Why does the sound of fabric folding rank among the most-requested ASMR triggers?'],
    ["What's the difference between good and bad fabric sounds ASMR?", 'What is the difference between cotton versus synthetic fabric sounds in close-mic ASMR recordings?'],
    ['Should I use headphones for fabric sounds ASMR?', 'Does close-mic placement make fabric sounds feel more immersive with headphones?'],
  ],
}

let totalFixed = 0
for (const [slug, replacements] of Object.entries(fixes)) {
  const p = data[slug]
  if (!p || !p.faqItems) { console.log('MISSING:', slug); continue }
  let slugFixed = 0
  for (const [oldQ, newQ] of replacements) {
    const faq = p.faqItems.find(f => f.question === oldQ)
    if (faq) {
      faq.question = newQ
      // Update shortAnswer if it duplicated the question
      slugFixed++
      totalFixed++
    } else {
      console.log(slug + ': NOT FOUND: ' + oldQ)
    }
  }
  console.log(slug + ': fixed ' + slugFixed + ' questions')
}

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(data, null, 2))
console.log('\nTotal questions fixed:', totalFixed)
console.log('Done')
