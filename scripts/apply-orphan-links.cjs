const fs = require('fs');

const pairsPath = process.argv[2] || 'C:/Users/mwoo7/AppData/Local/Temp/claude/C--Users-mwoo7-Downloads-claude-files/98b80874-9832-44b5-89dd-7b24f0f677e2/scratchpad/orphan-link-pairs.json';
const pairs = JSON.parse(fs.readFileSync(pairsPath, 'utf8'));
const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'));

let added = 0;
let skipped = 0;

for (const pair of pairs) {
  const donor = data[pair.donorSlug];
  if (!donor) { skipped++; continue; }
  if (!donor.crossLinks) donor.crossLinks = [];
  // Skip if href already exists
  if (donor.crossLinks.some(cl => cl.href === pair.orphanUrl)) { skipped++; continue; }
  donor.crossLinks.push({ label: pair.orphanLabel, href: pair.orphanUrl });
  added++;
}

fs.writeFileSync('src/lib/asmr-page-content.json', JSON.stringify(data, null, 2));
console.log('Added:', added, '| Skipped (dup/missing):', skipped);

// Verify: recount orphans
const published = Object.entries(data).filter(([,v]) => v.status === 'published').map(([s]) => s);
const inbound = {};
published.forEach(s => inbound[s] = 0);
published.forEach(slug => {
  (data[slug].crossLinks || []).forEach(cl => {
    const href = cl.href.replace(/^\/+|\/+$/g,'').replace(/^(guides|best|gear)\//,'');
    if (inbound[href] !== undefined) inbound[href]++;
  });
});
const orphansLeft = Object.entries(inbound).filter(([,c]) => c === 0).map(([s]) => s);
console.log('Orphans remaining:', orphansLeft.length);
if (orphansLeft.length) console.log(' ', orphansLeft.join(', '));
