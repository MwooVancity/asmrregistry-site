#!/usr/bin/env node
// Tell IndexNow engines (Bing, Yandex, etc.) that published URLs changed. Google does not use IndexNow.
// Usage: node tools/indexnow-ping.mjs [slug1,slug2]   (default: every published page at its canonical URL)
//        node tools/indexnow-ping.mjs --creators slug1,slug2   (creator pages, which live in D1, not the content file)
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY = 'a7f3c9e2b4d8f1a6';
const SITE = 'https://asmrregistry.com';
const content = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-page-content.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-keyword-ledger.json'), 'utf8'));
const urlOf = Object.fromEntries(ledger.pages.map(p => [p.slug, p.targetUrl]));

const keyRes = await fetch(`${SITE}/${KEY}.txt`);
const keyBody = (await keyRes.text()).trim();
if (keyRes.status !== 200 || keyBody !== KEY) { console.error(`FAIL: key file not live (status ${keyRes.status}, body "${keyBody.slice(0, 30)}")`); process.exit(1); }

const only = process.argv[2]?.split(',').map(s => s.trim());
const slugs = (only || Object.keys(content)).filter(s => content[s]?.status === 'published');
const creatorArg = process.argv.indexOf('--creators');
const urlList = creatorArg > 0
  ? [`${SITE}/creators/`, ...process.argv[creatorArg + 1].split(',').filter(Boolean).map(s => `${SITE}/creators/${s}/`)]
  : slugs.map(s => SITE + (urlOf[s] || `/${s}/`));
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: 'asmrregistry.com', key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: HTTP ${res.status} for ${urlList.length} URLs (200/202 = accepted)`);
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
