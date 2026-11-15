// Checks all crossLink hrefs in asmr-page-content.json against live site.
// Run: node scripts/check-crosslinks.js
const fs = require('fs');
const https = require('https');

const SITE = 'https://asmrregistry.com';
const store = JSON.parse(fs.readFileSync('src/lib/asmr-page-content.json', 'utf8'));

const hrefs = new Set();
for (const page of Object.values(store)) {
  for (const link of page.crossLinks || []) {
    if (link.href) hrefs.add(link.href);
  }
}

function check(href) {
  return new Promise(resolve => {
    const url = href.startsWith('http') ? href : SITE + href;
    https.get(url, { method: 'HEAD' }, res => {
      resolve({ href, status: res.statusCode });
    }).on('error', () => resolve({ href, status: 'ERR' }));
  });
}

(async () => {
  console.log(`Checking ${hrefs.size} unique crossLink hrefs...`);
  const results = await Promise.all([...hrefs].map(check));
  const broken = results.filter(r => r.status !== 200 && r.status !== 301 && r.status !== 302);
  if (broken.length === 0) {
    console.log('All crossLinks OK.');
  } else {
    console.log('BROKEN crossLinks:');
    broken.forEach(r => console.log(`  ${r.status}  ${r.href}`));
    process.exit(1);
  }
})();
