#!/usr/bin/env node
// Dated PubMed counts for guide pages (Unique Data rule). Writes src/lib/research-counts.json.
// Keeps the last file if any query fails, so a PubMed outage never blanks a page. Run weekly by weekly-deploy.yml.
import { readFileSync, writeFileSync, existsSync } from 'fs';

const OUT = 'src/lib/research-counts.json';
const ASMR = '"autonomous sensory meridian response"[tiab]';
const QUERIES = {
  'brown-noise': [['Brown noise, any topic', '"brown noise"[tiab]'], ['Brown noise and sleep', '"brown noise"[tiab] AND sleep[tiab]']],
  'brown-noise-for-sleep': [['Brown noise and sleep', '"brown noise"[tiab] AND sleep[tiab]'], ['White noise and sleep', '"white noise"[tiab] AND sleep[tiab]']],
  'brown-noise-vs-white-noise': [['Brown noise and sleep', '"brown noise"[tiab] AND sleep[tiab]'], ['Pink noise and sleep', '"pink noise"[tiab] AND sleep[tiab]'], ['White noise and sleep', '"white noise"[tiab] AND sleep[tiab]']],
  'pink-noise': [['Pink noise and sleep', '"pink noise"[tiab] AND sleep[tiab]'], ['Pink noise and memory', '"pink noise"[tiab] AND memory[tiab]']],
  'ambient-sounds': [['Nature or ambient sound and relaxation', '("nature sounds"[tiab] OR "ambient sound"[tiab]) AND (relaxation[tiab] OR stress[tiab])']],
  'asmr-and-highly-sensitive-person': [['ASMR, any topic', ASMR], ['ASMR and sensory sensitivity', `${ASMR} AND (sensitivity[tiab] OR "sensory processing"[tiab])`]],
  'is-asmr-bad-for-you': [['ASMR, any topic', ASMR], ['ASMR and misophonia', `${ASMR} AND misophonia[tiab]`], ['ASMR and sleep', `${ASMR} AND sleep[tiab]`]],
  // Per-claim evidence for the benefits people search (2026-11-10 SERP check: rivals say "research is small" without counts).
  'is-asmr-good-for-you': [['ASMR, any topic', ASMR], ['ASMR and sleep', `${ASMR} AND sleep[tiab]`], ['ASMR and anxiety or stress', `${ASMR} AND (anxiety[tiab] OR stress[tiab])`], ['ASMR and pain', `${ASMR} AND pain[tiab]`], ['ASMR and depression', `${ASMR} AND depress*[tiab]`], ['ASMR and randomized trial', `${ASMR} AND (randomized[tiab] OR randomised[tiab])`],
    // Rows for the condition pages merged here on 2026-11-11 (PTSD, tinnitus, migraine, nausea, OCD, older adults, panic).
    ['ASMR and PTSD or trauma', `${ASMR} AND (PTSD[tiab] OR trauma*[tiab])`], ['ASMR and tinnitus', `${ASMR} AND tinnitus[tiab]`], ['ASMR and migraine or headache', `${ASMR} AND (migraine*[tiab] OR headache*[tiab])`], ['ASMR and nausea', `${ASMR} AND nausea[tiab]`], ['ASMR and OCD', `${ASMR} AND (OCD[tiab] OR obsessive[tiab])`], ['ASMR and panic', `${ASMR} AND panic[tiab]`], ['ASMR and older adults', `${ASMR} AND ("older adults"[tiab] OR elderly[tiab] OR aging[tiab])`]],
  'asmr-for-autism': [['ASMR, any topic', ASMR], ['ASMR and autism', `${ASMR} AND (autism[tiab] OR autistic[tiab])`]],
};

const out = {};
const date = new Date().toISOString().slice(0, 10);
try {
  for (const [slug, list] of Object.entries(QUERIES)) {
    out[slug] = { date, rows: [] };
    for (const [label, term] of list) {
      const r = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&rettype=count&retmode=json&term=${encodeURIComponent(term)}`);
      const count = Number((await r.json()).esearchresult?.count);
      if (!Number.isFinite(count)) throw new Error(`bad count for ${term}`);
      out[slug].rows.push({ label, term, count });
      await new Promise((ok) => setTimeout(ok, 400)); // PubMed asks for under 3 requests a second without a key
    }
  }
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`research counts: ${Object.keys(out).length} pages, ${date}`);
} catch (e) {
  console.warn(`research counts: ${e.message}. ${existsSync(OUT) ? 'Keeping last file.' : 'No file yet.'}`);
  if (!existsSync(OUT)) process.exit(1);
}
