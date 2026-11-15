const fs = require('fs');
const raw = fs.readFileSync('state/extend-how-to-do-asmr.json','utf8');
const d = JSON.parse(raw);
const w = d[0].prose.introHtml.replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length;
console.log('VERIFIED '+d[0].slug+' '+w+'w');
