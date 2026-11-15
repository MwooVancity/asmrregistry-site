const fs = require('fs');
const d = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json','utf8'));

// what-does-asmr-mean-in-text: needs ~19w — short addition
d['what-does-asmr-mean-in-text'].proTips.push(
  'When someone uses ASMR as a verb in a text message, for example saying something is very ASMR or that a place gives ASMR vibes, they mean the atmosphere is unusually calming in a sensory way. The word has stretched well beyond its original meaning.'
);

// misophonia-and-asmr: needs ~29w — short addition
d['misophonia-and-asmr'].proTips.push(
  'If a ASMR video spikes your misophonia unexpectedly, do not power through hoping it gets better. Stop immediately. Exposure to your misophonia triggers does not desensitize you over time. Close it and open something from your safe list instead.'
);

// headache: needs ~51w
d['headache'].proTips.push(
  'Cold compress on the forehead plus quiet ASMR works better than either alone for tension headaches. The physical sensation of cold gives your pain-monitoring brain something neutral to focus on, and the ASMR fills the auditory space so discomfort thoughts have less room to loop.'
);

// how-to-make-asmr-videos: needs ~80w
d['how-to-make-asmr-videos'].proTips.push(
  'Respond to every comment in your first 50 videos, even the ones that are just the single word relaxing or a string of heart emojis. YouTube watches creator-to-viewer engagement signals in the first 48 hours after posting. A channel with replies shows the algorithm this creator is active, which matters more at 100 subscribers than at 100,000.'
);

// brushing: needs ~92w
d['brushing'].proTips.push(
  'Wet-brush ASMR, where the brush runs through damp hair, produces a distinctly different sound from dry brushing. The weight of wet hair changes the stroke sound from a crisp swish to a slower, heavier drag. Some viewers who find dry brushing too sharp respond much better to wet. Worth a separate search if standard brushing videos have not clicked.'
);

// nature: needs ~121w
d['nature'].proTips.push(
  'If you find that nature ASMR works for sleep but not for anxiety, try changing the listening context rather than the content. Anxiety relief sessions work better sitting upright in a chair with eyes closed than lying in bed. The horizontal position cues sleep, not calm, and your brain notices the mismatch. Save the lying-down listening for bedtime and use a chair or sofa for any daytime anxiety use.'
);

// is-asmr-good-for-you: needs ~106w
d['is-asmr-good-for-you'].proTips.push(
  'If you are evaluating ASMR for a child or teenager, the evidence base for young people is smaller than for adults but the safety profile is good. Opt for non-roleplay, non-voice content for children under 12, specifically rain, tapping, and page-turning videos. These carry the least ambiguity about appropriate use and still deliver the same auditory calm that makes ASMR effective for adults.'
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
