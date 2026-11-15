#!/usr/bin/env node
// Live-site audit: fetches every published page's rendered HTML and measures on-page SEO + content quality.
// Read-only. Usage: node tools/site-audit.mjs [--out file.json] [--limit N]
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://asmrregistry.com';
const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

const content = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-page-content.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(join(ROOT, 'src/lib/asmr-keyword-ledger.json'), 'utf8'));
const urlOf = Object.fromEntries(ledger.pages.map(p => [p.slug, p.targetUrl]));
const slugs = Object.keys(content).filter(s => content[s].status === 'published').slice(0, LIMIT);
const pages = slugs.map(s => ({ slug: s, path: urlOf[s] || `/${s}/` }));

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const strip = s => decode(s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (tag, name) => (tag.match(new RegExp(`${name}=("([^"]*)"|'([^']*)')`, 'i')) || [])[2] ?? (tag.match(new RegExp(`${name}=("([^"]*)"|'([^']*)')`, 'i')) || [])[3];

async function audit(p) {
  const t0 = Date.now();
  const res = await fetch(SITE + p.path, { redirect: 'manual' });
  const ttfb = Date.now() - t0;
  const html = await res.text();
  const r = { ...p, status: res.status, ttfb, htmlBytes: html.length, issues: [] };
  if (res.status !== 200) { r.issues.push(`status ${res.status}`); return r; }
  const I = (sev, msg) => r.issues.push(`${sev}:${msg}`);

  r.title = decode((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '');
  r.meta = decode(attr((html.match(/<meta[^>]+name=["']description["'][^>]*>/i) || [''])[0], 'content') || '');
  r.canonical = attr((html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i) || [''])[0], 'href') || '';
  r.robots = attr((html.match(/<meta[^>]+name=["']robots["'][^>]*>/i) || [''])[0], 'content') || '';
  r.lang = (html.match(/<html[^>]*lang=["']([^"']+)/i) || [])[1] || '';
  r.og = /property=["']og:title["']/.test(html) && /property=["']og:description["']/.test(html);
  const h1s = [...html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/gi)].map(m => strip(m[0]));
  r.h1 = h1s[0] || ''; r.h1Count = h1s.length;
  r.h2 = [...html.matchAll(/<h2[\s>][\s\S]*?<\/h2>/gi)].map(m => strip(m[0]));
  r.h3Count = (html.match(/<h3[\s>]/gi) || []).length;

  const main = (html.match(/<main[\s\S]*?<\/main>/i) || [html])[0].replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ');
  const text = strip(main);
  r.words = text.split(/\s+/).filter(Boolean).length;
  const paras = [...main.matchAll(/<p[\s>][\s\S]*?<\/p>/gi)].map(m => strip(m[0])).filter(x => x.length > 40);
  r.paraHashes = paras.map(x => createHash('md5').update(x.toLowerCase()).digest('hex').slice(0, 10));
  r.firstPara = (paras[0] || '').slice(0, 160);
  const sents = text.split(/(?<=[.!?])\s+/).filter(x => x.split(' ').length > 3);
  r.avgSentence = sents.length ? +(sents.reduce((n, x) => n + x.split(/\s+/).length, 0) / sents.length).toFixed(1) : 0;
  r.longParas = paras.filter(x => (x.match(/[.!?](\s|$)/g) || []).length > 4).length;

  const imgs = [...html.matchAll(/<img[^>]*>/gi)].map(m => m[0]);
  r.imgs = imgs.length;
  r.imgNoAlt = imgs.filter(i => attr(i, 'alt') === undefined || attr(i, 'alt') === '').length;
  r.imgNoDims = imgs.filter(i => !/width=/.test(i) || !/height=/.test(i)).length;

  const links = [...main.matchAll(/<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ href: decode(m[1]), text: strip(m[2]) }));
  r.internal = [...new Set(links.filter(l => l.href.startsWith('/') && !l.href.startsWith('//')).map(l => l.href.split('?')[0]))];
  r.external = links.filter(l => /^https?:\/\//.test(l.href) && !l.href.startsWith(SITE));
  r.genericAnchors = links.filter(l => /^(click here|read more|here|learn more|more|link)$/i.test(l.text) || /^[→›»]+$/.test(l.text)).length;
  r.extNoRel = [...main.matchAll(/<a\s[^>]*href=["']https?:\/\/(?!asmrregistry\.com)[^"']+["'][^>]*>/gi)].filter(m => !/rel=["'][^"']*(noopener|nofollow|sponsored|ugc)/i.test(m[0]) && /target=["']_blank/i.test(m[0])).length;

  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  r.ldTypes = []; r.ldBad = 0; r.faqLd = 0;
  for (const j of ld) { try { const o = JSON.parse(j); const arr = Array.isArray(o) ? o : (o['@graph'] || [o]); arr.forEach(n => { r.ldTypes.push(n['@type']); if (n['@type'] === 'FAQPage') r.faqLd = (n.mainEntity || []).length; if (n['@type'] === 'Article' && n.datePublished) r.articleDatePublished = true; }); } catch { r.ldBad++; } }
  r.faqVisible = (html.match(/<details[\s>]/gi) || []).length;
  r.hasByline = /By <a[^>]*zoe-harlow/i.test(html);
  r.hasUpdated = /Updated (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/.test(text) || /Updated (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/.test(html.replace(/<[^>]+>/g, ' '));
  r.refs = (html.match(/<section[^>]*class=["'][^"']*references/i) ? (html.match(/class=["']references[\s\S]*?<\/section>/i) || [''])[0].match(/<a\s/g) || [] : []).length;

  // issue rules
  if (!r.title) I('P0', 'no title'); else { if (r.title.length > 62) I('P1', `title ${r.title.length} chars`); if (r.title.length < 25) I('P1', `title short ${r.title.length}`); if (/ - ASMR Registry$|—/.test(r.title)) I('P2', 'title has suffix or em dash'); }
  if (!r.meta) I('P0', 'no meta description'); else { if (r.meta.length > 160) I('P1', `meta ${r.meta.length} chars`); if (r.meta.length < 90) I('P1', `meta short ${r.meta.length}`); }
  if (r.h1Count !== 1) I('P0', `h1 count ${r.h1Count}`);
  if (r.h2.length < 3) I('P1', `only ${r.h2.length} h2`);
  if (r.words < 700) I('P1', `thin ${r.words} words`);
  if (!r.canonical || !r.canonical.endsWith(p.path)) I('P0', `canonical ${r.canonical}`);
  if (/noindex/i.test(r.robots)) I('P0', `robots ${r.robots}`);
  if (!r.og) I('P2', 'missing og tags');
  if (r.imgNoAlt) I('P1', `${r.imgNoAlt} images without alt`);
  if (r.imgNoDims) I('P2', `${r.imgNoDims} images without width/height`);
  if (r.internal.length < 3) I('P1', `only ${r.internal.length} internal links`);
  if (r.genericAnchors) I('P2', `${r.genericAnchors} generic anchors`);
  if (r.extNoRel) I('P2', `${r.extNoRel} _blank links without rel`);
  if (r.ldBad) I('P0', 'invalid JSON-LD');
  if (r.faqVisible && r.faqLd !== r.faqVisible) I('P1', `faq visible ${r.faqVisible} vs schema ${r.faqLd}`);
  if (r.articleDatePublished) I('P2', 'Article datePublished present');
  if (!r.hasByline) I('P1', 'no author byline');
  if (!r.hasUpdated) I('P2', 'no visible updated date');
  if (r.avgSentence > 24) I('P2', `long sentences avg ${r.avgSentence}`);
  if (r.longParas > 2) I('P2', `${r.longParas} paragraphs over 4 sentences`);
  if (r.htmlBytes > 150000) I('P2', `html ${Math.round(r.htmlBytes / 1000)}KB`);
  if (r.ttfb > 1200) I('P2', `slow ttfb ${r.ttfb}ms`);
  return r;
}

const rows = await pool(pages, 8, audit);
const ok = rows.filter(r => r.status === 200);

// cross-page checks
const byTitle = {}, byMeta = {}, byPara = {}, inbound = {};
for (const r of ok) {
  (byTitle[r.title] = byTitle[r.title] || []).push(r.slug);
  (byMeta[r.meta] = byMeta[r.meta] || []).push(r.slug);
  for (const h of new Set(r.paraHashes)) (byPara[h] = byPara[h] || []).push(r.slug);
  for (const l of r.internal) inbound[l] = (inbound[l] || 0) + 1;
}
for (const r of ok) {
  if (byTitle[r.title].length > 1) r.issues.push(`P0:duplicate title with ${byTitle[r.title].filter(s => s !== r.slug).slice(0, 2).join(',')}`);
  if (r.meta && byMeta[r.meta].length > 1) r.issues.push(`P1:duplicate meta with ${byMeta[r.meta].filter(s => s !== r.slug).slice(0, 2).join(',')}`);
  const shared = r.paraHashes.filter(h => byPara[h].length > 1);
  r.sharedParaPct = r.paraHashes.length ? Math.round(100 * shared.length / r.paraHashes.length) : 0;
  if (r.sharedParaPct >= 20) r.issues.push(`P1:${r.sharedParaPct}% paragraphs duplicated on other pages`);
  r.inbound = inbound[r.path] || 0;
  if (r.inbound < 2) r.issues.push(`P1:only ${r.inbound} inbound internal links`);
}

// internal link health: probe every unique internal href
const allHrefs = [...new Set(ok.flatMap(r => r.internal))].filter(h => !/\.(png|jpg|svg|css|js|xml|txt)$/.test(h));
const probes = await pool(allHrefs, 10, async h => { try { const x = await fetch(SITE + h, { method: 'HEAD', redirect: 'manual' }); return [h, x.status, x.headers.get('location') || '']; } catch { return [h, 0, '']; } });
const bad = probes.filter(([, s]) => s !== 200);
const badMap = Object.fromEntries(bad.map(([h, s, l]) => [h, { s, l }]));
for (const r of ok) { const b = r.internal.filter(h => badMap[h]); if (b.length) r.issues.push(`P1:${b.length} internal links not 200 (${b.slice(0, 2).map(h => h + '=' + badMap[h].s).join(', ')})`); }

if (OUT) writeFileSync(OUT, JSON.stringify({ rows, probes: bad }, null, 2));

// ---- report
const sev = r => r.issues.reduce((n, i) => n + (i.startsWith('P0') ? 10 : i.startsWith('P1') ? 3 : 1), 0);
const count = {};
for (const r of rows) for (const i of r.issues) { const k = i.replace(/\d+/g, 'N').replace(/with [\w,-]+/, 'with X').replace(/\(.*\)/, ''); count[k] = (count[k] || 0) + 1; }
console.log(`pages audited: ${rows.length} | non-200: ${rows.length - ok.length} | unique internal links probed: ${allHrefs.length} | non-200 targets: ${bad.length}`);
console.log('\nISSUE COUNTS (pages affected)');
Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 34).forEach(([k, v]) => console.log(String(v).padStart(4), k));
console.log('\nWORST 15 PAGES (score = 10*P0 + 3*P1 + P2)');
[...rows].sort((a, b) => sev(b) - sev(a)).slice(0, 15).forEach(r => console.log(String(sev(r)).padStart(3), r.slug.padEnd(34), r.words + 'w', '|', r.issues.slice(0, 4).join(' ; ').slice(0, 150)));
const w = ok.map(r => r.words).sort((a, b) => a - b);
console.log(`\nwords: min ${w[0]} median ${w[w.length >> 1]} max ${w[w.length - 1]} | pages <700w: ${w.filter(x => x < 700).length} | ttfb median ${ok.map(r => r.ttfb).sort((a, b) => a - b)[ok.length >> 1]}ms`);
