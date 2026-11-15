#!/usr/bin/env node
// Truth gate: every checkable claim on the site must match its source. Runs in prebuild; exit 1 on any P0.
//   P0 creator bio: a number that is not in that creator's data, or a length claim off by >20% from the real median.
//   P0 page prose: a "Name (year)" or "Name and colleagues (year)" citation whose author is not in the page references.
//   P0 page prose: a PubMed count with no month and year beside it (counts change, so an undated one misleads).
//   P0 page prose: a catalog count that is more than 10% off the current catalog.
// Usage: node tools/truth-gate.mjs [--list]
import { readFileSync } from 'fs';
import { wrongLength, lengthClaims } from '../scripts/lib/creator-gate-lib.mjs';

const LIST = process.argv.includes('--list');
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const content = read('src/lib/asmr-page-content.json');
const creators = read('src/lib/creators-data.json');
const hub = read('src/lib/hub-data-all.json');
const fails = [];
const fail = (where, why) => fails.push(`${where}: ${why}`);
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');

// Creator bios
for (const [slug, c] of Object.entries(creators)) {
  const pct = (n) => Math.round((100 * n) / c.count);
  const known = new Set([c.count, c.medianMin, c.firstYear, c.lastYear, c.noTalkingCount, pct(c.noTalkingCount),
    ...c.triggers.flatMap(([, n]) => [n, pct(n)]), ...c.lengths.flatMap(([, n]) => [n, pct(n)]),
    ...['signature', 'top', 'sleep', 'short', 'noTalking', 'newest'].flatMap((k) => (c[k] || []).flatMap((v) => [v.m, ...(String(v.t).match(/\d+(?:\.\d+)?/g) || [])])),
    ...lengthClaims(c.bio).map(([, n]) => n), ...(c.titleNums || []), // length claims are checked separately against the median below
    10, 15, 30, 60, 1, 2, 3, 4, 5].map(String));
  for (const n of c.bio.match(/\b\d+(?:[.,]\d+)?\b/g) || []) if (!known.has(n.replace(/,/g, ''))) fail(`creator ${slug}`, `number ${n} not in its data`);
  for (const [text] of wrongLength(c.bio, c.medianMin)) fail(`creator ${slug}`, `"${text}" but the median is ${c.medianMin}`);
  // "none/nothing ... under ten minutes" (or "over an hour") while the length table counts some (2026-11-11:
  // tranquillily said nothing under ten minutes beside "Under 10 min: 1"). "almost none" is allowed.
  const lens = Object.fromEntries(typeof c.lengths === 'string' ? JSON.parse(c.lengths) : c.lengths || []);
  for (const [re, bucket] of [[/(?<!almost )\b(none|nothing)\b(?:\W+\w+){0,6}?\W+under (ten|10) minutes/i, 'Under 10 min'], [/(?<!almost )\b(none|nothing)\b(?:\W+\w+){0,6}?\W+(over|past|longer than) an hour/i, 'Over an hour']])
    if (re.test(c.bio) && lens[bucket] > 0) fail(`creator ${slug}`, `bio says none in "${bucket}" but the table has ${lens[bucket]}`);
  // A sentence naming one listed video and a length: that length must match the video (20%, at least 3 minutes).
  const norm = (s) => s.toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, ' ').trim();
  const vids = ['signature', 'top', 'sleep', 'short', 'noTalking', 'newest'].flatMap((k) => c[k] || []).filter((v) => v.m > 0)
    .map((v) => [v, norm(v.t).split(' ').slice(0, 4).join(' ')]).filter(([, key]) => key.length > 8);
  for (const s of c.bio.split(/(?<=[.!?])\s+/)) {
    const m = s.match(/\b(\d+) minutes?/);
    const hits = m ? vids.filter(([, key]) => norm(s).includes(key)) : [];
    const hit = hits.length === 1 && hits[0]; // two videos in one sentence: cannot tell which the number belongs to
    if (hit && Math.abs(+m[1] - hit[0].m) > Math.max(3, hit[0].m * 0.2)) fail(`creator ${slug}`, `says ${m[0]} for "${hit[0].t.slice(0, 40)}", which runs ${hit[0].m}`);
  }
}

// Page prose
const CITE = /\b([A-Z][a-zA-Z'-]+)(?: and colleagues| et al\.?| and [A-Z][a-zA-Z'-]+)? \((?:[A-Za-z ,]+)?(19|20)\d{2}\b/g;
const MONTHS = /(January|February|March|April|May|June|July|August|September|October|November|December) (20\d{2})|20\d{2}-\d{2}/;
const triggerCount = Object.fromEntries((hub.triggersOverview || []).map((t) => [t.trigger.replace(/-/g, ' '), t.count]));
for (const [slug, p] of Object.entries(content)) {
  if (p.status !== 'published') continue;
  const text = [p.introHtml, ...(p.sections || []).map((s) => s.content), ...(p.faqItems || []).map((f) => f.answer), ...(p.proTips || [])].map(strip).join(' ');
  const refs = (p.references || []).map((r) => `${r.label} ${r.url}`).join(' ').toLowerCase();
  for (const m of text.matchAll(CITE)) {
    const name = m[1];
    if (/^(In|The|A|An|Our|This|By|From|Since|Until|At|On|As|For|Of|To|Its|Personality|Psychology|Frontiers|Journal|PubMed|PeerJ|PLOS|[A-Z]{2,})$/.test(name)) continue;
    if (!refs.includes(name.toLowerCase())) fail(`page ${slug}`, `cites ${name} (${m[0].slice(-4)}) but no reference names ${name}`);
  }
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    if (/pubmed/i.test(s) && /\b\d+ (papers|records|results|studies)\b/i.test(s) && !MONTHS.test(s)) fail(`page ${slug}`, `undated PubMed count: "${s.slice(0, 90)}"`);
  }
  // Catalog table rows typed into prose: "Eating sounds 11,171" style, checked against the current count.
  for (const m of String(p.introHtml || '').matchAll(/<td>(?:<a [^>]*>)?([^<]+)(?:<\/a>)?<\/td><td>([\d,]+)<\/td>/g)) {
    const key = m[1].toLowerCase().replace(/ roleplay$/, '');
    const now = triggerCount[key];
    const said = Number(m[2].replace(/,/g, ''));
    if (now && Math.abs(said - now) > now * 0.1) fail(`page ${slug}`, `says ${m[1]} ${said} videos, catalog now has ${now}`);
  }
}

// Recommended videos and repeated counts (helpfulness audit 2026-11-03).
for (const [kind, hubs] of [['trigger', hub.triggerHubs], ['intent', hub.intentHubs]]) {
  for (const [slug, h] of Object.entries(hubs || {})) {
    for (const v of h.videos || []) {
      if ((v.duration_seconds || 0) < 180) fail(`${kind} ${slug}`, `recommends a video under 3 minutes: ${String(v.title).slice(0, 50)}`);
      if (slug === 'sleep' && (v.primary_trigger === 'eating-sounds' || v.duration_seconds < 1800)) fail(`intent sleep`, `sleep pick is eating or under 30 min: ${String(v.title).slice(0, 50)}`);
    }
    const f = hub.facts?.[slug];
    if (kind === 'trigger' && f && h.totalVideoCount !== f.count) fail(`trigger ${slug}`, `badge says ${h.totalVideoCount} videos, catalog block says ${f.count}`);
  }
}
for (const s of hub.catalogStats || []) { const f = hub.facts?.[s.trigger]; if (f && f.count !== s.count) fail(`finder ${s.trigger}`, `table says ${s.count}, catalog block says ${f.count}`); }

// Claims about our own process that are false: nobody listens to videos and nothing is tested hands-on.
import { readdirSync } from 'fs';
const FALSE_PROCESS = /(from|based on|in our|through) listening sessions?|human[- ]reviewed|quality score|editorially assigned|flagged and corrected|tested against real|we tested|our testing|hands-on test(ed|ing) (by us|these)|first[- ]hand (listening|use)/i;
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(astro|ts)$/.test(e.name) ? [`${d}/${e.name}`] : []));
for (const f of [...walk('src/pages'), ...walk('src/components'), ...walk('src/layouts'), 'src/lib/video-insights.ts', 'public/llms.txt']) {
  const m = readFileSync(f, 'utf8').match(FALSE_PROCESS);
  if (m) fail(`file ${f}`, `false process claim "${m[0]}"`);
}
for (const [slug, p] of Object.entries(content)) if (p.status === 'published') { const m = JSON.stringify(p).match(FALSE_PROCESS); if (m) fail(`page ${slug}`, `false process claim "${m[0]}"`); }

// Internal links must point at a page's canonical address, not a path that redirects (link audit 2026-11-04).
const led = read('src/lib/asmr-keyword-ledger.json');
const canon = Object.fromEntries(led.pages.map((p) => [p.slug, p.targetUrl]));
for (const [slug, p] of Object.entries(content)) {
  if (p.status !== 'published') continue;
  const hrefs = [...[p.introHtml, ...(p.sections || []).map((s) => s.content), ...(p.faqItems || []).map((f) => f.answer)].join(' ').matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]);
  for (const h of [...hrefs, ...(p.crossLinks || []).map((l) => l.href)]) {
    const s = h.replace(/^\/(guides\/|best\/|gear\/)?/, '').replace(/\/$/, '');
    if (canon[s] && canon[s] !== h && content[s]?.status === 'published') fail(`page ${slug}`, `links ${h}, which redirects to ${canon[s]}`);
  }
}

const by = {};
for (const f of fails) { const k = f.split(':')[1].trim().split(' ').slice(0, 2).join(' '); by[k] = (by[k] || 0) + 1; }
console.log(`truth-gate: ${Object.keys(creators).length} creator bios, ${Object.values(content).filter((p) => p.status === 'published').length} pages, ${fails.length} failures`, by);
if (LIST || fails.length <= 40) console.log(fails.join('\n'));
process.exitCode = fails.length ? 1 : 0;
