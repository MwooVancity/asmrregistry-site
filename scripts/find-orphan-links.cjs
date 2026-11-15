// Outputs candidate crossLink pairs for orphan pages
// Run: node scripts/find-orphan-links.cjs
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json','utf8'));
const ledger = JSON.parse(fs.readFileSync('src/lib/asmr-keyword-ledger.json','utf8'));

const slugToUrl = {};
ledger.pages.forEach(p => { slugToUrl[p.slug] = p.targetUrl; });

const published = Object.entries(data)
  .filter(([,v]) => v.status === 'published')
  .map(([s]) => s);

// Build inbound count
const inbound = {};
published.forEach(s => inbound[s] = 0);
published.forEach(slug => {
  (data[slug].crossLinks || []).forEach(cl => {
    const href = cl.href.replace(/^\/+|\/+$/g,'').replace(/^(guides|best|gear)\//,'');
    if (inbound[href] !== undefined) inbound[href]++;
  });
});

const orphans = Object.entries(inbound).filter(([,c]) => c === 0).map(([s]) => s);

// Output for agent
const orphanData = orphans.map(s => ({
  slug: s,
  url: slugToUrl[s] || '/' + s + '/',
  label: s.replace(/-/g,' ')
}));

const donorData = published.filter(s => !orphans.includes(s)).map(s => ({
  slug: s,
  url: slugToUrl[s] || '/' + s + '/',
  label: s.replace(/-/g,' '),
  existingLinks: (data[s].crossLinks || []).map(cl => cl.href)
}));

const output = { orphans: orphanData, donors: donorData };
fs.writeFileSync('state/orphan-link-candidates.json', JSON.stringify(output, null, 2));
console.log('Orphans:', orphans.length);
console.log('Donors:', donorData.length);
console.log('Written: state/orphan-link-candidates.json');
