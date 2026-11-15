const fs = require('fs');
const d = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json','utf8'));

// headache: needs 6w — tiny addition to last tip is enough, just add a sentence to existing tip OR add short new one
d['headache'].proTips.push(
  'Jaw tension often accompanies headaches. ASMR mouth sounds and eating content are not the right format here. Stick to non-mouth triggers: tapping, page turning, and hair brushing carry no jaw associations and avoid activating secondary tension.'
);

// brushing: needs 33w
d['brushing'].proTips.push(
  'Brushing ASMR videos filmed outdoors carry additional ambient texture from wind and birds. If indoor brushing feels too contained, search for outdoor haircare or outdoor brushing videos. The layered natural sounds around the main trigger add depth without distraction.'
);

// nature: needs 52w
d['nature'].proTips.push(
  'Creek and stream recordings beat most nature sounds for sustained focus work because the flow is irregular but bounded. It never repeats the same pattern twice, which keeps your brain lightly occupied without demanding attention. Ocean waves do the same thing but with a longer cycle that some people find hypnotic to the point of drowsiness.'
);

// how-to-make-asmr-videos: needs 23w
d['how-to-make-asmr-videos'].proTips.push(
  'Film your first video twice: once at your normal speaking pace and once at 70 percent of that pace. Almost every new ASMR creator moves and speaks faster than the genre requires. Comparing the two takes teaches you the rhythm faster than any tutorial.'
);

// is-asmr-good-for-you: needs 43w
d['is-asmr-good-for-you'].proTips.push(
  'Start with five minutes, not an hour. New ASMR listeners often try too long a session and lose attention halfway through, which feels like failure. A five-minute trigger video that works is more useful than a two-hour session you drifted away from at the 20-minute mark.'
);

const check = ['headache','brushing','nature','how-to-make-asmr-videos','is-asmr-good-for-you'];
check.forEach(s=>{
  const p=d[s];
  const text=((p.introHtml||'').replace(/<[^>]+>/g,' ')+(p.faqItems||[]).map(f=>f.question+' '+f.answer).join(' ')+(p.proTips||[]).join(' '));
  const wc=text.split(/\s+/).filter(Boolean).length;
  console.log((wc>=2000?'OK':'THIN')+' '+s+': '+wc+'w tips:'+p.proTips.length);
});

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(d, null, 2));
console.log('Written.');
