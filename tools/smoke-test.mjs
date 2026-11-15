#!/usr/bin/env node
// Smoke test: fetch every sitemap URL, report non-200s
// Usage: node tools/smoke-test.mjs

const SITEMAP_URL = 'https://asmrregistry.com/sitemap.xml';

const xml = await fetch(SITEMAP_URL).then(r => r.text());
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
console.log(`Checking ${urls.length} URLs from sitemap...`);

const errors = [];
for (const url of urls) {
  const r = await fetch(url, { redirect: 'follow' });
  if (r.status >= 400) {
    errors.push(`${r.status} ${url}`);
    console.error(`  FAIL ${r.status}: ${url}`);
  } else {
    process.stdout.write('.');
  }
}

console.log('');
if (errors.length) {
  console.error(`\nSMOKE FAILED: ${errors.length} page(s) returning 4xx/5xx`);
  errors.forEach(e => console.error('  ' + e));
  process.exit(1);
} else {
  console.log(`All ${urls.length} pages OK.`);
}
