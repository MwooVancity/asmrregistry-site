#!/usr/bin/env node
// Fetches public datasets used by on-page charts -> src/lib/datasets.json
// Gate: exits 1 if any dataset is empty, short, or a request fails. Never writes partial data.
import { writeFileSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TERM = '"autonomous sensory meridian response"[Title/Abstract]';
const FIRST = 2010;
const LAST = new Date().getFullYear() - 1; // current year is partial, exclude

async function pubmedCount(year) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&rettype=count&term=${encodeURIComponent(TERM)}&datetype=pdat&mindate=${year}&maxdate=${year}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    const j = await res.json().catch(() => null);
    const c = j?.esearchresult?.count;
    if (c !== undefined) return Number(c);
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`PubMed count failed for ${year}`);
}

const points = [];
for (let y = FIRST; y <= LAST; y++) {
  points.push({ x: String(y), y: await pubmedCount(y) });
  await sleep(400);
}

if (points.length < 10 || points.every(p => p.y === 0) || points[points.length - 1].y === 0) {
  console.error('FAIL: PubMed dataset empty or implausible', points);
  process.exit(1);
}

const today = new Date().toISOString().split('T')[0];

// PubMed: papers whose title/abstract mention ASMR and each topic (one count query per topic)
const TOPICS = [
  ['Relaxation', 'relaxation'], ['Anxiety', 'anxiety'], ['Stress', 'stress'], ['Sleep and insomnia', '(sleep OR insomnia)'],
  ['Mindfulness and meditation', '(mindfulness OR meditation)'], ['Depression', '(depression OR depressive)'], ['Misophonia', 'misophonia'],
  ['Heart rate', '"heart rate"'], ['Pain', '(pain OR analgesia)'], ['Blood pressure', '"blood pressure"'],
  ['Dopamine', 'dopamine'], ['Vagus nerve', '(vagus OR vagal)'], ['PTSD or trauma', '(PTSD OR posttraumatic)'],
  ['ADHD', '(ADHD OR "attention deficit")'], ['Migraine or headache', '(migraine OR headache)'], ['Nausea', 'nausea'],
  ['Panic attacks', 'panic'], ['Tinnitus', 'tinnitus'], ['OCD', '(OCD OR obsessive-compulsive)'],
];
async function topicCount(term) {
  const q = `${TERM} AND ${term}`;
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&rettype=count&term=${encodeURIComponent(q)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const j = await (await fetch(url)).json().catch(() => null);
    const c = j?.esearchresult?.count;
    if (c !== undefined) return Number(c);
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`PubMed topic count failed for ${term}`);
}
const topicPts = [];
for (const [label, term] of TOPICS) { topicPts.push({ x: label, y: await topicCount(term) }); await sleep(400); }
topicPts.sort((a, b) => b.y - a.y);
if (topicPts[0].y < 10 || topicPts.length < TOPICS.length) { console.error('FAIL: PubMed topic counts implausible', topicPts); process.exit(1); }

// ClinicalTrials.gov: registered ASMR trials
const ctRes = await (await fetch('https://clinicaltrials.gov/api/v2/studies?query.term=%22autonomous+sensory+meridian+response%22&pageSize=100&fields=NCTId,BriefTitle,OverallStatus,StartDate')).json();
const STATUS = { COMPLETED: 'Completed', NOT_YET_RECRUITING: 'Not yet recruiting', RECRUITING: 'Recruiting', ACTIVE_NOT_RECRUITING: 'Active', UNKNOWN: 'Unknown', WITHDRAWN: 'Withdrawn', TERMINATED: 'Terminated' };
const trials = (ctRes.studies || []).map(s => ({
  id: s.protocolSection.identificationModule.nctId,
  title: s.protocolSection.identificationModule.briefTitle,
  status: STATUS[s.protocolSection.statusModule.overallStatus] || s.protocolSection.statusModule.overallStatus,
  start: s.protocolSection.statusModule.startDateStruct?.date || '',
})).sort((a, b) => b.start.localeCompare(a.start));
if (trials.length < 1) { console.error('FAIL: ClinicalTrials.gov returned no trials'); process.exit(1); }

// First-party: videos classified per trigger (hub-data-all.json is built from D1; dated by file mtime)
const HUB = join(ROOT, 'src/lib/hub-data-all.json');
const hub = JSON.parse(readFileSync(HUB, 'utf8')).triggerHubs;
const label = k => k.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const trig = Object.entries(hub).map(([k, v]) => ({ x: label(k), y: v.totalVideoCount || 0 })).filter(p => p.y > 0).sort((a, b) => b.y - a.y);
if (trig.length < 10) { console.error('FAIL: trigger data implausible', trig.length); process.exit(1); }

const datasets = {
  'asmr-research-papers': {
    kind: 'bar', title: 'ASMR research papers published per year',
    source: 'PubMed (U.S. National Library of Medicine)',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/?term=%22autonomous+sensory+meridian+response%22%5BTitle%2FAbstract%5D',
    query: TERM, fetchedAt: today, unit: 'papers', points,
  },
  'asmr-clinical-trials': {
    kind: 'trials', title: 'Registered ASMR clinical trials',
    source: 'ClinicalTrials.gov (U.S. National Library of Medicine)',
    sourceUrl: 'https://clinicaltrials.gov/search?term=%22autonomous%20sensory%20meridian%20response%22',
    fetchedAt: today, unit: 'trials', trials,
  },
  'asmr-research-topics': {
    kind: 'hbar', title: 'ASMR papers in PubMed by topic (title or abstract mentions ASMR and the topic)',
    source: 'PubMed (U.S. National Library of Medicine)',
    sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/?term=%22autonomous+sensory+meridian+response%22%5BTitle%2FAbstract%5D',
    fetchedAt: today, unit: 'papers', points: topicPts,
    note: 'A paper counts if its title or abstract mentions both ASMR and the topic, so a count is not the same as a study that tests ASMR for that topic. Zero means PubMed returned no matching paper on the retrieval date.',
  },
  'asmr-trigger-videos': {
    kind: 'hbar', title: 'ASMR videos classified per trigger',
    source: 'ASMR Registry video database',
    sourceUrl: 'https://asmrregistry.com/methodology/',
    fetchedAt: statSync(HUB).mtime.toISOString().split('T')[0], unit: 'videos', points: trig.slice(0, 12),
  },
};

const OUT = join(ROOT, 'src/lib/datasets.json');
let existing = {};
try { existing = JSON.parse(readFileSync(OUT, 'utf8')); } catch {}
writeFileSync(OUT, JSON.stringify({ ...existing, ...datasets }, null, 2), 'utf8');
console.log('OK papers', points.length, '| trials', trials.length, '| triggers', trig.length, 'top', trig[0].x, trig[0].y);
