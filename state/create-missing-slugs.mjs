import fs from 'fs'

const file = 'src/lib/asmr-page-content.json'
const data = JSON.parse(fs.readFileSync(file, 'utf8'))

data['asmr-tingles-not-working'] = {
  slug: 'asmr-tingles-not-working',
  title: 'ASMR Tingles Not Working? Here\'s Why and How to Fix It',
  metaDescription: 'ASMR tingles stopped working? Learn the real causes, the 2-week reset protocol, and how to get your response back tonight.',
  h1: 'ASMR Tingles Not Working',
  introHtml: `<p>If ASMR used to work and now it doesn't, your brain has habituated to the stimulus. That's the most common cause by a long margin, and it's reversible. A 2-3 week break from ASMR usually resets the response.</p>

<h2>Key Takeaways</h2>
<ul>
<li>Habituation is the most common reason tingles stop: your brain stops generating reward for stimuli it can perfectly predict.</li>
<li>A 2-3 week break from all ASMR content is the standard reset. During the break, avoid even background ASMR.</li>
<li>Stress and high anxiety block the tingle response even when content is good, because your nervous system stays in alert mode.</li>
<li>Some medications, especially SSRIs and antihistamines, blunt ASMR sensitivity significantly.</li>
<li>About 30% of people never experience tingles at all. Relaxation without tingles is still a valid and common outcome.</li>
</ul>

<h2>Why Tingles Stop: The Main Causes</h2>
<p>Your brain learns. When you watch the same creators repeatedly, your brain builds a perfect model of what's coming next.</p>
<p>Once it can predict the stimulus, the dopamine reward for that stimulus drops. No reward signal means no tingle. This is habituation, and it happens with any repeated pleasurable experience.</p>
<p>The fix is to make the stimulus novel again, either by switching creators entirely or taking a break long enough that the prediction fades.</p>

<h2>The 2-3 Week Break Protocol</h2>
<p>Two to three weeks off all ASMR content is enough for most people. Don't listen in the background, don't watch a few minutes, don't use it for sleep.</p>
<p>During the break, use white noise or rain sounds instead. These don't overlap with the ASMR reward pathways in the same way.</p>
<p>When you come back, start with a creator you've never watched before, not your old favorites. The novelty hit is stronger, and it helps rebuild the response from a fresh baseline.</p>
<p>Most people notice a significant improvement on the first or second session back. If not, extend the break by another week.</p>

<h2>Habituation vs. Burnout: Different Problems</h2>
<p>Habituation is a brain efficiency thing. Burnout is a stress thing. They look similar but have different fixes.</p>
<p>Habituation: ASMR tingles fade over time even when you're relaxed. Fix: break + novelty.</p>
<p>Burnout: ASMR tingles stop working when you're highly stressed, anxious, or emotionally exhausted, even though they used to work in those states. Fix: stress reduction first, then ASMR.</p>
<p>If you're in a high-stress period, ASMR often can't compete with your nervous system's alert state. The tingle response requires a degree of baseline calm to fire at all.</p>

<h2>How Stress Blocks Tingles</h2>
<p>The tingle response and the stress response share some of the same hardware.</p>
<p>When you're anxious, your body stays in a light ready-mode, scanning for threats. ASMR works partly by convincing your nervous system that nothing requires attention. If your anxiety is high enough, that convincing doesn't happen.</p>
<p>If you notice ASMR relaxes you but doesn't give you tingles, stress blocking is probably the issue.</p>
<p>Try 10 minutes of box breathing or progressive muscle relaxation before your ASMR session. Getting your baseline anxiety lower before you start gives the response more room to work.</p>

<h2>The Medication Factor</h2>
<p>SSRIs blunt dopamine-adjacent reward pathways, which is part of how they stabilize mood. The same mechanism can reduce ASMR sensitivity.</p>
<p>Antihistamines, especially older ones like diphenhydramine, have a sedating effect that can interfere with the specific quality of ASMR relaxation.</p>
<p>If you started a new medication around the time your tingles stopped, that's likely the cause. A break from ASMR won't help because the medication is doing the blocking.</p>
<p>Talk to your doctor before changing anything. But knowing the cause is useful, because it means you haven't broken your ASMR response. It means you need a different approach while on the medication.</p>

<h2>Wrong Conditions Can Kill the Response</h2>
<p>ASMR rarely works at a desk with overhead lights on. It needs low stimulation from everything else.</p>
<p>The conditions that work: lying down, lights off or very dim, headphones (not speakers), phone face-down, nothing else demanding your attention.</p>
<p>If you've only ever tried ASMR casually at your desk or on speakers, you may not have actually tested it properly. Give it five sessions in the right conditions before concluding it doesn't work for you.</p>
<p>Headphones are especially important. Binaural recordings don't work on speakers because the spatial left-right effect gets collapsed into mono. The effect feels flat and unconvincing without it.</p>

<h2>When You've Never Had Tingles</h2>
<p>About 30% of people are non-responders to the tingle specifically. This is likely genetic and trait-based, not a failure to try hard enough.</p>
<p>Non-responders still get real calming effects from ASMR. Heart rate drops, lower anxiety, easier sleep are all documented in non-responders too.</p>
<p>If you've tried ASMR properly for several weeks with headphones in bed and felt nothing, you're probably a non-responder to the tingle. That doesn't mean ASMR is useless for you, just that the benefit is relaxation rather than tingles.</p>

<h2>Rebuilding After Total Loss</h2>
<p>If your response has been gone for months, rebuild it in stages.</p>
<p>Week 1-3: complete break. Week 4: one short session with a brand new creator you've never heard before. Watch or listen with full attention, no multitasking.</p>
<p>Don't binge after the break. One session every 2-3 days in the first month back. The response is rebuilding its prediction model from scratch, and you want to keep the novelty alive longer this time.</p>
<p>Switching trigger types also helps. If whispering was your main trigger before, start with tapping or scratching. The brain's habituation is somewhat trigger-specific, so a new trigger type hits with more freshness.</p>`,

  faqItems: [
    {
      question: 'Why did my ASMR tingles stop working?',
      answer: 'The most common reason is habituation. Your brain has learned to predict the stimulus perfectly and reduced the dopamine reward for it. This happens naturally with repeated exposure to the same creators and trigger types. Less often, tingles stop because of high stress, a new medication like an SSRI or antihistamine, or because you\'ve been watching in suboptimal conditions. A 2-3 week break fixes habituation. Stress and medication require a different approach.',
      shortAnswer: 'Most likely habituation: your brain predicts the stimulus and stops rewarding it. A 2-3 week break from all ASMR fixes this in most cases. Stress and medications can also block tingles independently.'
    },
    {
      question: 'How do I get my ASMR tingles back?',
      answer: 'Take a 2-3 week break from all ASMR content, including background use. When you return, start with a creator you\'ve never watched before rather than your old favorites. The novelty is what reactivates the response. Watch one session every 2-3 days rather than bingeing. If you\'re also dealing with high stress or anxiety, work on lowering your baseline before relying on ASMR. Box breathing or progressive muscle relaxation before a session helps bring your baseline down enough for the tingle response to fire.',
      shortAnswer: 'Take a 2-3 week break, then return with a brand new creator you\'ve never heard before. Go slowly: one session every 2-3 days. If stress is blocking it, lower your anxiety baseline first.'
    },
    {
      question: 'Is ASMR tingle immunity permanent?',
      answer: 'No. ASMR immunity is habituation, which is temporary and reversible. It\'s your brain being efficient, not damaged. A 2-3 week break lets the prediction model fade, and familiar videos hit again on return. The exception is medication-induced immunity. If an SSRI or antihistamine is blocking your response, a break won\'t help because the medication is doing the blocking, not habituation. In that case, the response typically returns when the medication changes, not before.',
      shortAnswer: 'No, it\'s temporary. Habituation fades with a 2-3 week break. The one exception is medication-induced loss, where SSRIs or antihistamines are blocking the response, and a break alone won\'t fix it.'
    },
    {
      question: 'Does everyone get ASMR tingles?',
      answer: 'No. Research estimates that about 30% of people are non-responders to the tingle specifically. This is likely trait-based and related to how their nervous system processes sensory input, not a failure to try hard enough. Non-responders can still get real calming benefits from ASMR, including lower heart rate and reduced anxiety, because the relaxation pathway is at least partly separate from the tingle pathway. If you\'ve tried ASMR properly for several weeks with headphones in bed and felt nothing, you may be a non-responder.',
      shortAnswer: 'No, about 30% of people don\'t experience tingles at all. This is likely genetic and trait-based. Non-responders still get real calming effects from ASMR, just not the tingle specifically.'
    },
    {
      question: 'Why does ASMR make me sleepy but not tingly?',
      answer: 'Sleepiness and tingles are separate outcomes of ASMR. The relaxation response that causes drowsiness is more widely shared than the tingle response. Most people who watch ASMR for sleep find it works regardless of whether they get tingles. If you get reliably sleepy but not tingly, you\'re getting the benefit you actually want. The tingle is a bonus, not a requirement. You may also find that tingles appear occasionally under the right conditions, even if they\'re not consistent.',
      shortAnswer: 'Sleepiness and tingles are separate responses. Most people who use ASMR for sleep don\'t need tingles to get the benefit. Getting reliably sleepy means it\'s working. Tingles are a bonus, not required.'
    },
    {
      question: 'Can stress or anxiety prevent ASMR tingles?',
      answer: 'Yes. High anxiety keeps your nervous system in a light alert state, scanning for anything that needs attention. The tingle response requires a baseline of calm to fire. When anxiety is too high, ASMR can still relax you somewhat, but often not enough for the tingle response to get through. The fix is to reduce your baseline anxiety before the session. Try 5-10 minutes of slow breathing or body scan relaxation first. Once your nervous system is less activated, ASMR works more reliably.',
      shortAnswer: 'Yes. High anxiety keeps your nervous system in alert mode, which blocks the tingle response. Lower your baseline first: 5-10 minutes of slow breathing before ASMR helps. The relaxation benefit still works even when tingles are blocked.'
    }
  ],

  proTips: [
    'When returning after a break, use headphones and lie down in the dark. Don\'t try ASMR at your desk or on speakers — the conditions matter as much as the content.',
    'Switch trigger types after a break. If whispering was your main trigger, start with tapping or scratching. Habituation is somewhat trigger-specific, so a new type hits fresher.',
    'One session every 2-3 days after a reset, not nightly. Bingeing rebuilds habituation fast. Spacing out sessions keeps the response stronger longer.',
    'If your tingles vanished when you started a new medication, the drug is probably the cause. A break won\'t help. Check with your doctor, but know the response is likely still there underneath.',
    'ASMR without tingles is still useful. If you\'re getting reliably sleepy or calmer, that\'s the goal. Don\'t discard a working tool because one specific response faded.'
  ],

  crossLinks: [
    { label: 'ASMR for sleep', href: '/sleep/' },
    { label: 'ASMR for anxiety', href: '/anxiety/' },
    { label: 'binaural ASMR', href: '/binaural/' },
    { label: 'no-talking ASMR', href: '/no-talking/' },
    { label: 'how ASMR affects the brain', href: '/guides/how-asmr-affects-the-brain/' }
  ],

  references: [
    { label: 'Autonomous Sensory Meridian Response — Wikipedia', url: 'https://en.wikipedia.org/wiki/Autonomous_sensory_meridian_response' }
  ],

  lastUpdated: '2026-09-02',
  status: 'published'
}

data['what-is-asmr-roleplay'] = {
  slug: 'what-is-asmr-roleplay',
  title: 'What Is ASMR Roleplay? A No-BS Guide',
  metaDescription: 'ASMR roleplay explained: what it is, the most common scenarios, who it works for, and how it differs from trigger-only ASMR videos.',
  h1: 'What Is ASMR Roleplay',
  introHtml: `<p>ASMR roleplay is a video format where the creator plays a character in a scenario, using soft voice and ASMR triggers throughout. Common scenarios include doctor visits, hair appointments, and spa treatments. The creator talks to you as if you're in the scene, and the combination of personal attention and soft sounds triggers relaxation or tingles.</p>

<h2>Key Takeaways</h2>
<ul>
<li>ASMR roleplay adds a character and scenario to standard ASMR. The creator plays a role while delivering ASMR triggers through the character's actions.</li>
<li>The most popular scenarios are care-based: doctor exams, hair appointments, spa treatments, and friend check-ins.</li>
<li>Roleplay works especially well for people whose main ASMR trigger is personal attention, the feeling of being cared for directly.</li>
<li>Most ASMR roleplay is completely appropriate and non-romantic. The BFE/GFE category exists separately and is clearly labeled.</li>
<li>Pure trigger ASMR (tapping, rain, scratching) and roleplay ASMR serve different needs and often appeal to different people.</li>
</ul>

<h2>What Actually Happens in an ASMR Roleplay Video</h2>
<p>The creator sets up a scenario and plays a character within it. A typical example: the creator plays a nurse doing a health check.</p>
<p>They speak softly, make eye contact with the camera, and use props like a stethoscope, clipboard, or pen to create realistic sounds. The sounds are the ASMR part. The character and scenario are the frame.</p>
<p>You're meant to imagine yourself as the person receiving the care. That first-person framing is what makes roleplay different from other ASMR formats.</p>

<h2>The Most Common ASMR Roleplay Scenarios</h2>
<p>Doctor or nurse exam is the most-watched category. The creator listens to your heartbeat, checks your eyes, asks quiet questions. Every action has a corresponding soft sound.</p>
<p>Hair appointment scenarios are the second most popular. Soft scissor sounds, comb dragging, clicking near the ears, and the creator narrating what they're doing in a calm voice.</p>
<p>Spa and facial treatment videos include facial massage roleplay, skin tapping, product application sounds, and guided breathing.</p>
<p>Friend or companion roleplay is a different category: no professional scenario, just a creator sitting with you, talking quietly, maybe making tea or reading nearby. These are lower-energy and good for people who find professional scenarios too structured.</p>

<h2>Why People Watch ASMR Roleplay</h2>
<p>Personal attention is one of the strongest ASMR triggers. Having someone focus directly on you, speak to you specifically, and go through careful actions around you produces a distinct response that ambient sound videos can't replicate.</p>
<p>For many people, the scenarios also provide a feeling of being cared for, which has its own calming effect separate from the audio triggers.</p>
<p>ASMR roleplay also has a structure that pure ambient recordings don't. There's a beginning, a middle, and an end. Some people find that structure easier to follow into sleep than an open-ended rain loop.</p>

<h2>Who It Works Best For (and Who It Doesn't)</h2>
<p>If personal attention is your main ASMR trigger, roleplay is your best format. Doctor exams, hair appointments, and spa treatments are all built around close, focused attention on you specifically.</p>
<p>If you find the speaking voice distracting, roleplay probably won't work as a sleep tool. Any narrated content keeps your brain's language processing partially active, which makes it harder to drift off.</p>
<p>Some people find the scenarios themselves uncomfortable. Medical settings, someone whispering very close to you, or being "seen" by a character can feel strange rather than relaxing. That's a normal response, and it means pure trigger videos (no character, no scenario) are a better fit.</p>
<p>If you're not sure which side you're on, try a friend-sitting-with-you scenario first. Lower intensity, less clinical, easier to ease into.</p>

<h2>Is ASMR Roleplay Appropriate?</h2>
<p>The vast majority of ASMR roleplay content is completely appropriate and family-safe. Doctor exams, hair cuts, and spa treatments are the dominant categories.</p>
<p>The BFE (boyfriend experience) and GFE (girlfriend experience) categories do exist and are clearly labeled. These are distinct from mainstream ASMR roleplay and easy to avoid by searching for specific scenarios rather than browsing broadly.</p>
<p>YouTube's ASMR roleplay content is almost entirely appropriate. Platforms with less moderation have more adult content, but on YouTube the default search results for "ASMR roleplay" or "ASMR doctor" return safe content.</p>

<h2>How to Find Good Roleplay ASMR</h2>
<p>Search for the specific scenario rather than "ASMR roleplay" broadly. "ASMR hair appointment" or "ASMR cranial nerve exam" gets you targeted results.</p>
<p>Look for videos over 20 minutes if you're using it for sleep. Short roleplay videos can feel rushed and end before you've fully relaxed.</p>
<p>Check the creator's other videos before committing to a long session. If their style in other videos feels right, their roleplay will too. Voice quality and pacing vary a lot between creators.</p>

<h2>Roleplay vs. Trigger-Only ASMR: Which to Use</h2>
<p>Trigger-only ASMR (tapping, scratching, rain) has no narrative. You don't need to follow anything. It's easier to use as a sleep background because there's nothing to track.</p>
<p>Roleplay requires slightly more engagement at the start. You need to accept the scenario, adjust to the creator's voice, and follow the frame enough to let the personal attention effect kick in.</p>
<p>Use roleplay for wind-down (30-60 minutes before sleep, lights still on) and trigger-only for actual sleep onset. Many people find the combination works better than either alone.</p>
<p>If you only watch one type, try the other for a week. The two formats often work better for different moments in the same evening.</p>`,

  faqItems: [
    {
      question: 'What is ASMR roleplay and why do people watch it?',
      answer: 'ASMR roleplay is a format where the creator plays a character in a scenario, like a doctor, hairdresser, or spa therapist, while using soft voice and ASMR trigger sounds throughout. People watch it because the personal attention of being in the scene, with someone focused specifically on you, is one of the strongest ASMR triggers. The combination of sounds and the feeling of being cared for produces relaxation and tingles that ambient sound videos can\'t replicate.',
      shortAnswer: 'Creator plays a character in a scenario (doctor, hairdresser, spa) while delivering ASMR trigger sounds. Personal attention is the main draw: the feeling of someone focused directly on you triggers strong relaxation for many people.'
    },
    {
      question: 'Is ASMR roleplay appropriate for everyone?',
      answer: 'Most ASMR roleplay is completely appropriate and non-romantic. Doctor exams, hair appointments, and spa treatments are the dominant categories on YouTube and are family-safe. The BFE and GFE (boyfriend/girlfriend experience) categories do exist but are clearly labeled and separate from mainstream content. Standard searches for specific scenarios like "ASMR doctor" or "ASMR hair appointment" return appropriate results. If content concerns you, searching for a specific scenario rather than browsing broadly is safer.',
      shortAnswer: 'Yes, most is completely appropriate. Doctor exams, hair appointments, and spa treatments dominate. BFE/GFE content exists but is separately labeled. Searching specific scenarios rather than browsing broadly keeps results appropriate.'
    },
    {
      question: 'What are the most common ASMR roleplay scenarios?',
      answer: 'Doctor or nurse exam is the most watched category, with the creator listening to your heartbeat, checking your reflexes, and asking quiet questions. Hair appointment scenarios are second, featuring comb sounds, scissor clicks, and soft narration. Spa and facial treatments include skin tapping and product application sounds. Friend or companion roleplay involves no professional scenario, just quiet conversation and being together. Cranial nerve exam is a specific popular subcategory that combines the doctor format with systematic close attention.',
      shortAnswer: 'Most popular: doctor or nurse exam, hair appointment, spa/facial treatment, and friend companion. Cranial nerve exam is a specific popular subcategory. All involve the creator playing a character while delivering soft sounds and personal attention.'
    },
    {
      question: 'Does ASMR roleplay work for sleep?',
      answer: 'For wind-down, yes. For actual sleep onset, it depends on the person. Roleplay involves narration, which keeps language processing partially active. Some people find they drift off easily anyway, others find the voice too engaging to sleep through. A common approach: use roleplay for the 30-60 minutes before you want to sleep, then switch to trigger-only ASMR (tapping, rain, scratching) with no talking for the actual sleep transition. The roleplay does the relaxation work, the ambient track does the sleep work.',
      shortAnswer: 'Good for wind-down. For sleep onset it depends: narration keeps language processing partially active. Common approach: roleplay for 30-60 min before sleep, then switch to no-talking trigger ASMR for actual sleep.'
    },
    {
      question: 'What is the difference between ASMR roleplay and regular ASMR?',
      answer: 'Regular ASMR uses sounds like tapping, scratching, and whispering without a scenario or character. It\'s pure soundscape. Roleplay adds a frame: the creator plays a character, there\'s a setting, and you\'re positioned as a participant in the scene. Regular ASMR is easier to use as background audio because there\'s nothing to follow. Roleplay requires mild engagement with the scenario to get the personal attention effect. Both deliver ASMR triggers, but the mechanism is different.',
      shortAnswer: 'Regular ASMR is pure soundscape: tapping, rain, scratching with no scenario. Roleplay adds a character and setting where you\'re a participant. Roleplay requires mild engagement; regular ASMR works as pure background. Both deliver triggers, different mechanism.'
    },
    {
      question: 'Is ASMR roleplay the same as girlfriend/boyfriend ASMR?',
      answer: 'No. GFE (girlfriend experience) and BFE (boyfriend experience) ASMR is a specific subcategory involving a romantic frame. Standard ASMR roleplay is care-based: medical, grooming, spa, and companion scenarios with no romantic element. The two categories are distinct, separately labeled, and easy to tell apart. Searching for specific scenarios like "ASMR hair appointment" or "ASMR doctor exam" will not surface GFE/BFE content. GFE/BFE is a niche within ASMR, not the default.',
      shortAnswer: 'No. GFE/BFE is a specific subcategory with a romantic frame. Standard ASMR roleplay is care-based (medical, spa, grooming) with no romantic element. Searching specific scenarios keeps results in the care-based category.'
    }
  ],

  proTips: [
    'Try the cranial nerve exam format if you haven\'t. It\'s one of the most systematically effective personal attention formats, and most top ASMR creators have done one.',
    'Use roleplay for wind-down and trigger-only ASMR for actual sleep. The combination usually works better than either alone.',
    'Find one creator whose voice and pacing works for you, then watch their catalog rather than browsing broadly. Familiarity with the creator\'s style deepens the response over time.',
    'If a scenario feels awkward the first time, try it twice before deciding it doesn\'t work. The second watch is often more relaxing than the first because the frame is already familiar.',
    'For sleep use, pick a roleplay video over 30 minutes. Short videos end before you\'ve fully relaxed, and the ending can pull you back awake.'
  ],

  crossLinks: [
    { label: 'personal attention ASMR', href: '/personal-attention/' },
    { label: 'whispering ASMR', href: '/whispering/' },
    { label: 'ASMR for sleep', href: '/sleep/' },
    { label: 'ASMR for anxiety', href: '/anxiety/' },
    { label: 'what is mommy ASMR', href: '/guides/what-is-mommy-asmr/' },
    { label: 'BFE meaning in ASMR', href: '/guides/bfe-meaning-asmr/' }
  ],

  references: [
    { label: 'Autonomous Sensory Meridian Response — Wikipedia', url: 'https://en.wikipedia.org/wiki/Autonomous_sensory_meridian_response' }
  ],

  lastUpdated: '2026-09-02',
  status: 'published'
}

// Gate check both
const aiFiller = ['furthermore','moreover','delve','leverage','utilize','foster','harness','embark','robust','seamless','holistic','paradigm','cornerstone','game-changer']
const jargon = ['parasympathetic','mirror neurons','auditory cortex','cortisol','neurological','physiological','cognitive','stimuli','bilateral']

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
  const fatParas = paras.filter(pg => { const t=pg.replace(/<[^>]+>/g,''); return t.split(/[.!?]+/).filter(s=>s.trim().length>5).length>4 || t.length>300 })
  const shortAnswerFails = (p.faqItems||[]).filter(f => !f.shortAnswer || /<[a-z\/]/i.test(f.shortAnswer) || f.shortAnswer.split(/\s+/).length>50)
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
  if ((p.faqItems||[]).length < 3) issues.push('faq<3')
  if ((p.proTips||[]).length < 3) issues.push('tips<3')
  if ((p.crossLinks||[]).length < 3) issues.push('cross<3')
  console.log(slug + ': ' + (issues.length===0?'PASS words:'+words:'FAIL '+issues.join(' ')))
}

fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
console.log('Saved.')
