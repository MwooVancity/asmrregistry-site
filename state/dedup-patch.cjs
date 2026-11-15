const fs = require('fs');
const d = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json','utf8'));

d['what-does-asmr-mean-in-text'].proTips.push(
  'ASMR in text is generational shorthand now. If you see it used by someone under 30, they probably mean something felt unusually satisfying or soothing, not that they watched a YouTube video. Context is everything.'
);

d['misophonia-and-asmr'].proTips.push(
  'Build a personal safe-list over a week: add only the specific videos that never spiked you. Misophonia and ASMR both run on learned associations, and your safe-list becomes its own calming trigger over time.',
  'If a creator occasionally posts eating sounds between their safe content, mute notifications and only open videos you have already vetted. Surprise triggers land harder than expected ones because your guard is down.',
  'The crossover community on Reddit actively flags misophonia-safe channels. Search r/asmr with misophonia and sort by top all-time. You will find curated lists that took other people months of trial and error to build.'
);

d['headache'].proTips.push(
  'Hairdryer ASMR at very low volume works for some headache sufferers because the consistent mid-frequency wash masks the silence that makes throbbing more noticeable. Look for hairdryer white noise channels specifically.',
  'Try ASMR without any screen at all. Start a long audio-only session, put your phone face-down or in your pocket, and lie still. Removing the visual demand reduces the total sensory load on an already-stressed brain.',
  'Track which ASMR triggers actually help versus which just feel okay. Headache sensitivity changes day to day. A voice that works during tension headaches might feel irritating during a migraine. Keeping a quick note helps you reach for the right thing faster next time.'
);

d['how-to-make-asmr-videos'].proTips.push(
  'Listen back to every take wearing the same headphones your audience uses, not studio monitors. Consumer earbuds and over-ear headphones colour the sound differently. What sounds clean on monitors can sound harsh in headphones at midnight.',
  'Post a community poll after your first ten videos asking which trigger your subscribers want more of. You will find out fast that your favourite content is often not what converts viewers into regulars. Let the data steer.',
  'Watch your analytics for average view duration. ASMR viewers who leave in the first 90 seconds usually bounced on the sound, not the content. Viewers who leave between 5 and 15 minutes lost the tingle. Both are fixable but at different points in your setup.',
  'If your comments say your audio sounds too close or too intimate in a bad way, you are too near the mic. Back off two inches and reshoot the same content. Proximity effect on condenser mics is subtle in playback but loud in headphones at 1am.'
);

d['brushing'].proTips.push(
  'Try brushing on a book cover or a wood surface if you want texture without the sound getting too intimate. The material matters. Rough paper gives a satisfying rasp; smooth leather gives a whisper. Both carry differently than brushing on skin.',
  'Long-handled brushes held close to the mic pick up more handle vibration than bristle sound. Ask yourself whether you want the rasping texture or the air movement. Powder brushes give airy sounds; boar bristles give grip sounds. Knowing the difference halves your search time.',
  'If you use brushing ASMR to manage anxiety during the day, keep the volume slightly lower than you would for sleep. Higher volume makes ambient sounds feel blocked out, which some people find claustrophobic rather than calming. Around 40 percent on most devices is the floor to test from.',
  'The best brushing videos for deep relaxation usually show the brush in frame without the creator narrating what they are doing. The moment someone starts explaining the trigger, your brain shifts from experiencing it to analysing it. Silent channels with visible technique are the sweet spot.',
  'If brushing sounds work for you in videos but not in real life, that is normal. Chosen sounds register differently than environmental sounds because your attention is directed rather than captured. The psychology is the same reason ambient music calms you but neighbours talking does not.'
);

d['nature'].proTips.push(
  'Rain on a tent is denser and more enveloping than rain on a window because the recordist is inside the sound, not outside it. If rain videos have not clicked, find tent-camping rain recordings specifically. The contained feeling shifts how your nervous system receives the sound.',
  'High-quality field recordings list their equipment and location in the description. A Zoom H5 or H6 recorder in a real forest produces a different result than a smartphone in a backyard. Checking the description filters out most low-effort uploads.',
  'Thunderstorm ASMR works best when the thunder is distant and irregular. Close, regular thunder keeps your brain on alert. You want the storm to feel miles away and weakening, not approaching. Listen for the gap between lightning and thunder in the first 30 seconds to judge distance.',
  'If you want nature sounds for focus, pick environments without bird calls. Birdsong is beautiful but your brain half-processes it for meaning, which competes with reading or writing. River water, rain, and light wind are cognitively silent. Birdsong is not.',
  'Download one or two nature recordings directly to your device for nights when your connection is slow. Buffering interruptions at 2am reset your nervous system from calm to alert in under a second. A local file removes that variable entirely.'
);

d['is-asmr-good-for-you'].proTips.push(
  'Track your mood for two weeks with and without ASMR before bed and you will have your own data on whether it actually helps you. People who feel ASMR works often cannot separate it from other sleep hygiene improvements they made at the same time. Isolating the variable gives you an honest answer.',
  'ASMR is not a substitute for treatment if you have clinical anxiety or a diagnosed sleep disorder. Use it as a complement to whatever your doctor has recommended, not instead of it.',
  'If ASMR relaxes you but you feel slightly self-conscious about enjoying it, that reaction passes. The tingles and calm response are not something you are doing wrong. The self-consciousness usually fades by the third or fourth session once you stop monitoring your own reaction.',
  'Frequency matters more than duration. Thirty minutes of ASMR three nights in a row builds a stronger sleep association than a single two-hour session. Your nervous system learns to respond faster when the stimulus is regular.',
  'People who get no response from ASMR are not missing something. The tingle response is not universal and absence of tingles does not mean absence of benefit. Calm without tingles is still calm.',
  'If you are using ASMR to wind down from screen time, switch from watching to audio-only within 20 minutes of sleep. Screens stimulate even when the content is calming. Moving to closed eyes and audio-only is the last step that actually prepares your brain for sleep.'
);

const check = ['headache','brushing','nature','how-to-make-asmr-videos','is-asmr-good-for-you','misophonia-and-asmr','what-does-asmr-mean-in-text'];
check.forEach(s=>{
  const p=d[s];
  const text=((p.introHtml||'').replace(/<[^>]+>/g,' ')+(p.faqItems||[]).map(f=>f.question+' '+f.answer).join(' ')+(p.proTips||[]).join(' '));
  const wc=text.split(/\s+/).filter(Boolean).length;
  console.log((wc>=2000?'OK':'THIN')+' '+s+': '+wc+'w tips:'+p.proTips.length);
});

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(d, null, 2));
console.log('Written.');
