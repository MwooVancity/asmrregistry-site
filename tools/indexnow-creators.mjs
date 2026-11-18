// Tells Bing (IndexNow) about creator pages built or refreshed today, plus their video pages. Runs after the daily
// deploy. The cron worker's IndexNow stage only reads the old database, so these pages were never announced.
// 10,000 URLs per request (IndexNow limit). A failed ping never fails the deploy.
import { readdirSync, readFileSync } from 'node:fs';
const KEY = 'a7f3c9e2b4d8f1a6', SITE = 'https://asmrregistry.com', DIR = 'public/creator-data';
const today = new Date().toISOString().slice(0, 10);
const urls = [];
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  try {
    const d = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8'));
    if (d.fetched !== today) continue;
    const slug = f.slice(0, -5);
    // Creator pages only (2026-11-18): pinging every video page pulled ~30K crawler hits a day into a 100K/day free
    // Workers limit shared with the river site. Video pages stay in the sitemap for crawlers to reach at their pace.
    urls.push(`${SITE}/creators/${slug}/`);
  } catch {}
}
for (let i = 0; i < urls.length; i += 10000) {
  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: 'asmrregistry.com', key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls.slice(i, i + 10000) }),
    });
    console.log(`indexnow: ${Math.min(10000, urls.length - i)} URLs, HTTP ${r.status}`);
  } catch (e) { console.log(`indexnow: failed ${e.message}`); }
}
if (!urls.length) console.log('indexnow: nothing built today');
