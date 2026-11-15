#!/usr/bin/env node
// Ping all 219 live pages to IndexNow (Bing/Yandex) + Google sitemap endpoint
import fs from 'fs'
import https from 'https'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/asmr-page-content.json'), 'utf8'))
const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/lib/asmr-keyword-ledger.json'), 'utf8'))
const slugToUrl = Object.fromEntries(ledger.pages.map(p => [p.slug, p.targetUrl]))

const published = Object.keys(data).filter(s => data[s]?.status === 'published')
const urls = published.map(s => 'https://asmrregistry.com' + (slugToUrl[s] || `/${s}/`))
console.log(`Submitting ${urls.length} URLs...`)

function post(hostname, path, body) {
  return new Promise(resolve => {
    const buf = Buffer.from(body)
    const req = https.request(
      { hostname, path, method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length } },
      res => { res.resume(); res.on('end', () => resolve(res.statusCode)) }
    )
    req.on('error', e => { console.error('Request error:', e.message); resolve(0) })
    req.write(buf); req.end()
  })
}

function get(url) {
  return new Promise(resolve => {
    https.get(url, res => { res.resume(); res.on('end', () => resolve(res.statusCode)) })
      .on('error', e => { console.error('GET error:', e.message); resolve(0) })
  })
}

// ── 1. IndexNow — covers Bing + Yandex ───────────────────────────────────────
const indexNowBody = JSON.stringify({
  host: 'asmrregistry.com',
  key: 'a7f3c9e2b4d8f1a6',
  keyLocation: 'https://asmrregistry.com/a7f3c9e2b4d8f1a6.txt',
  urlList: urls
})
const bingStatus = await post('api.indexnow.org', '/indexnow', indexNowBody)
console.log(`IndexNow (Bing/Yandex): ${bingStatus} — ${urls.length} URLs`)
if (bingStatus === 200) console.log('  ✓ Accepted — Bing will crawl within hours')
else if (bingStatus === 202) console.log('  ✓ Queued')
else console.log('  ✗ Unexpected status — check key verification at https://asmrregistry.com/a7f3c9e2b4d8f1a6.txt')

console.log(`\nDone. ${urls.length} URLs submitted to IndexNow (Bing/Yandex).`)
console.log('Google sitemap ping deprecated Jan 2024 — Googlebot reads sitemap-pages.xml via robots.txt automatically.')
console.log('For priority pages: use GSC URL Inspection tool manually (no API equivalent).')
