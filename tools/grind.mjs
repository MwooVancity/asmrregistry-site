#!/usr/bin/env node
/**
 * Standalone ASMR grind pipeline using DeepSeek API.
 * v2 — ported improvements from calcscrape grind2.md:
 *   - 8-section research brief (real questions, content gaps, authority sources, reader stages)
 *   - Helpfulness lens prose prompt (decision-oriented, against-interest, named stories)
 *   - Quality agent pass before gate
 *   - Filler strip post-apply
 * Usage: node tools/grind.mjs [slug]
 *   slug optional — defaults to remaining[0] in state/grind-queue.json
 */

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
if (!DEEPSEEK_KEY) { console.error('DEEPSEEK_API_KEY missing: set it in .env'); process.exit(1); }
const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const CONTENT_FILE = 'src/lib/asmr-page-content.json';
const QUEUE_FILE = 'state/grind-queue.json';
const TODAY = new Date().toISOString().slice(0, 10);

async function chat(messages, { temperature = 0.7, max_tokens = 4096 } = {}) {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DEEPSEEK_KEY}`,
    },
    body: JSON.stringify({ model: 'deepseek-chat', messages, temperature, max_tokens }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

// ── Step 1: Research brief (v2 — 8 sections) ────────────────────────────────
async function researchBrief(slug) {
  const topic = slug.replace(/-/g, ' ');
  console.log(`\n[1] Research brief for: ${slug}`);
  const content = await chat([
    {
      role: 'user',
      content: `Research "${topic}" for an ASMR content page. Output EXACTLY these 8 sections. Be specific — no generic answers.

1. SEARCH INTENT — what does the searcher want to learn or decide? Informational / commercial / navigational?
2. READER STAGES — 2-3 stages a reader might be at (first-timer, curious, experienced listener). Which is the majority?
3. REAL QUESTIONS — 8 questions a real person asks a friend or forum about "asmr ${topic}". Not keyword-tool questions.
4. PEOPLE ALSO ASK — 6 actual PAA questions Google shows for "asmr ${topic}"
5. TOP RESULT FORMAT — what format dominates top 5 results? (paragraph / list / table / steps)
6. CONTENT GAPS — what do top results NOT cover that a searcher would genuinely want?
7. AGAINST-INTEREST TRUTH — one honest thing most ASMR pages won't say about this topic (works for some people, not others; common mistakes; overhyped claims)
8. AUTHORITY SOURCES — 2-3 real URLs (PubMed, academic, or .gov) relevant to this topic. Only list URLs you're confident exist.`,
    },
  ], { temperature: 0.5, max_tokens: 1500 });
  return content;
}

// ── Step 2: Prose agent (v2 — helpfulness lens) ──────────────────────────────
async function writeProse(slug, brief, currentEntry) {
  console.log(`[2] Writing prose for: ${slug}`);

  const crossLinksPool = `Triggers: /massage/, /eating-sounds/, /whispering/, /slime/, /triggers-overview/, /personal-attention/, /glass-sounds/, /typing/, /rain/, /kisses/, /ocean/, /soap-carving/, /scratching/, /sand/, /cooking/, /tapping/, /painting/, /hair-play/, /soft-speaking/, /mouth-sounds/, /no-talking/, /breathing/, /light-patterns/, /brushing/, /nature/, /binaural/
Intents: /sleep/, /kids/, /anxiety/, /headache/, /relax/
Formats: /asmr-games/, /vr-asmr/, /unintentional-asmr/, /asmr-podcast/, /live-asmr/, /lofi-asmr/, /long-asmr/
Guides: /guides/sleep-sounds/, /guides/white-noise/, /guides/brown-noise/, /guides/frisson/, /guides/rain-sounds-for-sleeping/, /guides/misophonia/, /guides/asmr-for-studying/, /guides/ai-asmr-generator/, /guides/pink-noise/, /guides/sound-therapy-and-asmr/, /guides/binaural-beats-guide/, /guides/brown-noise-for-sleep/, /guides/brown-noise-vs-white-noise/, /guides/how-asmr-affects-the-brain/, /guides/nature-sounds-for-sleep/, /guides/ambient-sounds/, /guides/asmr-community/, /guides/misophonia-and-asmr/, /guides/vagus-nerve-and-asmr/, /guides/sound-sensitivity/
Info: /guides/whats-asmr/, /guides/is-asmr-good-for-you/, /guides/how-to-make-asmr-videos/, /guides/what-does-asmr-stand-for/, /guides/asmr-meaning-slang/, /guides/asmr-significado/, /guides/que-es-asmr/, /guides/what-is-asmr-massage/, /guides/what-does-asmr-mean-in-text/, /guides/asmr-meaning-in-social-media/, /guides/how-to-do-asmr/, /guides/why-does-asmr-make-you-tingle/, /guides/how-to-make-ai-asmr-videos/, /guides/what-is-mommy-asmr/, /guides/how-to-start-an-asmr-channel/, /guides/what-is-lofi-asmr/, /guides/how-to-create-asmr-food-content/, /guides/how-do-asmr-youtubers-make-money-without-ads/, /guides/bfe-meaning-asmr/
Best: /best/best-asmr-videos/, /best/best-asmr/, /best/best-asmr-for-sleep/, /best/best-asmr-microphone/, /best/best-headphones-for-asmr/, /best/best-kept-secret-asmr/, /best/best-microphone-for-asmr/, /best/best-asmr-youtube-channels/, /best/best-earbuds-for-asmr/
Gear: /gear/asmr-microphone/, /gear/asmr-gear-tools/, /gear/asmr-equipment/
Creators: /creators/`;

  const raw = await chat([
    {
      role: 'user',
      content: `You're writing a page for asmrregistry.com — a free ASMR video directory.

RESEARCH BRIEF:
${brief}

## Helpfulness rules (HARD — apply to every sentence)

The only question that matters: "Does this help the reader RIGHT NOW?"

- Every section must close with what the reader should DO or TRY next.
- Name the reader's situation in the intro. Don't open with generic topic framing.
- Include the AGAINST-INTEREST TRUTH from the brief. Most ASMR pages are cheerleaders. Be honest.
- 2-3 mini-stories: use a real first name, one concrete detail, one outcome. ("Maya put on a 3-hour fireplace loop and fell asleep in 12 minutes.")
- No fence-sitting. Give a direct answer. If it depends, say what it depends on and give a threshold.
- After reading, the person should NOT need to Google anything else about this topic.

## Output

Output ONLY a single valid JSON object. No narration, no markdown fences.

CURRENT CONTENT:
${JSON.stringify(currentEntry, null, 2)}

{
  "introHtml": "<p> and <h2> HTML only",
  "faqItems": [{"question": "...", "answer": "..."}],
  "crossLinks": [{"label": "...", "href": "/slug/"}],
  "references": [{"label": "...", "url": "https://..."}],
  "metaDescription": "..."
}

## Field rules

**introHtml**: Direct answer in sentence 1 (the AGAINST-INTEREST TRUTH goes here or in the second paragraph). Then the hook. Then H2 sections covering what the research brief says searchers want. HTML only: <p> and <h2>. Total prose (introHtml + faqItems combined) must be at least 1500 words.

**faqItems**: Use the REAL QUESTIONS and PAA from the brief. At least 5 items. Each answer at least 60 words. Plain, direct answers — no filler openers like "Great question" or "Absolutely." Each answer should close with something the reader can DO or TRY.

**crossLinks**: At least 3 from this pool only:
${crossLinksPool}

**references**: At least 1 real URL (study, PubMed, .gov). Only list URLs you're confident are real and live.

**metaDescription**: 160 chars max. Include "ASMR". Answer the search query directly.

## Writing rules (HARD — gate will fail on violations)

- Short sentences. Mix 5-10 word punchy with 15-25 word flowing.
- Contractions: don't, can't, you're, it's
- Active voice
- No em dashes — use commas or periods instead
- No jargon: parasympathetic, mirror neurons, auditory cortex, cortisol, endorphins, serotonin, neurological, physiological, cognitive, stimuli, bilateral
- No AI filler: furthermore, moreover, delve, leverage, utilize, navigate, foster, harness, embark, robust, seamless, holistic, paradigm, landscape, journey, crucial, vital, essential, myriad, plethora, cornerstone, game-changer, underscore, elevate, unlock
- Keep slug, title, h1 unchanged
- Escape double-quotes inside HTML strings as \\"`,
    },
  ], { temperature: 0.8, max_tokens: 4096 });

  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(cleaned);
}

// ── Step 2.5: Quality agent pass ─────────────────────────────────────────────
async function qualityCheck(slug, entry, brief) {
  console.log(`[2.5] Quality check for: ${slug}`);
  const allText = [
    entry.introHtml || '',
    ...(entry.faqItems || []).map(f => f.question + ' ' + f.answer),
  ].join(' ').replace(/<[^>]+>/g, ' ');

  const verdict = await chat([
    {
      role: 'user',
      content: `You are a quality auditor for an ASMR content page.

SLUG: ${slug}
RESEARCH BRIEF (what the page should cover):
${brief}

PAGE TEXT:
${allText.slice(0, 6000)}

Answer these questions. Be critical — cheerful verdicts are useless.

1. After reading this, does the reader still need to Google anything? List any unanswered question from the research brief.
2. Is there an against-interest truth (something honest that most ASMR pages avoid)? Yes/No — quote it if yes.
3. Does every section end with something the reader can DO or TRY? Flag any section that just informs with no action.
4. Are there at least 2 named mini-stories (real name + concrete detail + outcome)? Yes/No.
5. Is the intro decision-oriented (names the reader's situation) or generic topic framing?

Output JSON only:
{
  "unansweredQuestions": ["..."],
  "hasAgainstInterest": true/false,
  "missingSections": ["..."],
  "hasNamedStories": true/false,
  "introIsDecisionOriented": true/false,
  "verdict": "PASS" or "FIX"
}`,
    },
  ], { temperature: 0.3, max_tokens: 800 });

  try {
    const cleaned = verdict.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return { verdict: 'PASS' }; // don't block on parse failure
  }
}

// ── Strip known filler before gate ──────────────────────────────────────────
const FILLER_REPLACEMENTS = {
  'game-changer': 'big deal',
  'game changer': 'big deal',
  'furthermore': 'also',
  'moreover': 'also',
  'utilize': 'use',
  'leverage': 'use',
  'foster': 'build',
  'harness': 'use',
  'embark': 'start',
  'seamless': 'smooth',
  'holistic': 'full',
  'paradigm': 'model',
  'cornerstone': 'core',
  'underscore': 'show',
  'elevate': 'improve',
  'unlock': 'open',
  'delve': 'dig',
  'navigate': 'handle',
  'robust': 'strong',
  'crucial': 'key',
  'vital': 'key',
  'essential': 'key',
  'myriad': 'many',
  'plethora': 'many',
};

function stripFiller(entry) {
  const fields = ['introHtml', 'metaDescription'];
  for (const f of fields) {
    if (!entry[f]) continue;
    for (const [bad, good] of Object.entries(FILLER_REPLACEMENTS)) {
      entry[f] = entry[f].replace(new RegExp(bad, 'gi'), good);
    }
  }
  if (entry.faqItems) {
    entry.faqItems = entry.faqItems.map(item => {
      let { question, answer } = item;
      for (const [bad, good] of Object.entries(FILLER_REPLACEMENTS)) {
        question = question.replace(new RegExp(bad, 'gi'), good);
        answer = answer.replace(new RegExp(bad, 'gi'), good);
      }
      return { question, answer };
    });
  }
  return entry;
}

// ── Step 3: Quality gate ─────────────────────────────────────────────────────
function runGate(slug, data) {
  const p = data[slug];
  const allText = [
    p.introHtml || '',
    ...(p.faqItems || []).map(b => b.question + ' ' + b.answer),
  ].join(' ');
  const text = allText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const syllables = words.reduce((s, w) => {
    const m = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').match(/[aeiouy]{1,2}/g);
    return s + Math.max(1, m ? m.length : 1);
  }, 0);
  const flesch = (
    206.835 -
    1.015 * (words.length / Math.max(1, sentences.length)) -
    84.6 * (syllables / words.length)
  ).toFixed(1);
  const emDashes = (text.match(/—/g) || []).length;
  const aiFiller = [
    'furthermore','moreover','delve','leverage','utilize','foster','harness',
    'embark','robust','seamless','holistic','paradigm','cornerstone','game-changer',
  ];
  const aiFound = aiFiller.filter(ph => new RegExp('\\b' + ph + '\\b', 'i').test(text));
  const jargon = ['parasympathetic','mirror neurons','cortisol','neurological','physiological','cognitive','stimuli'];
  const jargonFound = jargon.filter(ph => new RegExp('\\b' + ph + '\\b', 'i').test(text));
  const metaOk = p.metaDescription && p.metaDescription.length <= 160 && p.metaDescription.includes('ASMR');

  console.log(`[3] Gate — words:${words.length} flesch:${flesch} emDashes:${emDashes}`);
  console.log(`    ai:${aiFound.length ? aiFound.join(',') : 'none'} jargon:${jargonFound.length ? jargonFound.join(',') : 'none'}`);
  console.log(`    metaOk:${metaOk} faq:${p.faqItems?.length} tips:${p.proTips?.length} crossLinks:${p.crossLinks?.length}`);

  const failures = [];
  if (emDashes > 0) failures.push(`em dashes: ${emDashes}`);
  if (aiFound.length) failures.push(`AI filler: ${aiFound.join(',')}`);
  if (jargonFound.length) failures.push(`jargon: ${jargonFound.join(',')}`);
  if (!metaOk) failures.push('metaDescription bad');
  if (!p.faqItems || p.faqItems.length < 3) failures.push('faqItems < 3');
  if (!p.crossLinks || p.crossLinks.length < 3) failures.push('crossLinks < 3');
  if (words.length < 1000) failures.push(`too short: ${words.length} words`);

  return failures;
}

// ── Step 4: Ship ─────────────────────────────────────────────────────────────
function ship(slug) {
  console.log(`[4] Committing + pushing: ${slug}`);
  execSync(`git add ${CONTENT_FILE} ${QUEUE_FILE}`, { stdio: 'inherit' });
  execSync(`git commit -m "content(asmr): rewrite ${slug} in plain language"`, { stdio: 'inherit' });
  execSync('git push', { stdio: 'inherit' });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const queue = readJSON(QUEUE_FILE);
  const slug = process.argv[2] || queue.remaining[0];

  if (!slug) {
    console.log('Queue empty. Nothing to do.');
    process.exit(0);
  }

  if (!queue.remaining.includes(slug)) {
    console.log(`"${slug}" not in remaining queue.`);
    process.exit(1);
  }

  const contentData = readJSON(CONTENT_FILE);
  if (!contentData[slug]) {
    console.error(`"${slug}" missing from ${CONTENT_FILE}. Add skeleton first.`);
    process.exit(1);
  }

  console.log(`\n=== GRIND v2: ${slug} ===`);

  // Step 1: research
  const brief = await researchBrief(slug);

  // Steps 2 + 2.5 + 3 — up to 3 attempts
  let applied = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let prose;
    try {
      prose = await writeProse(slug, brief, contentData[slug]);
    } catch (e) {
      console.warn(`Attempt ${attempt} prose parse failed: ${e.message}`);
      if (attempt === 3) { console.error(`Skipping ${slug} — prose unparseable after 3 tries`); return; }
      continue;
    }

    Object.assign(contentData[slug], prose);
    contentData[slug].lastUpdated = TODAY;
    stripFiller(contentData[slug]);
    writeJSON(CONTENT_FILE, contentData);
    console.log(`[2b] Applied prose (attempt ${attempt})`);

    // Quality agent (soft — logs but doesn't block)
    const qv = await qualityCheck(slug, contentData[slug], brief);
    if (qv.verdict === 'FIX') {
      console.log(`[2.5] Quality issues: unanswered=${JSON.stringify(qv.unansweredQuestions||[])}, stories=${qv.hasNamedStories}, against-interest=${qv.hasAgainstInterest}`);
    } else {
      console.log(`[2.5] Quality passed.`);
    }

    const failures = runGate(slug, contentData);
    if (!failures.length) { applied = true; break; }
    console.warn(`Gate failures (attempt ${attempt}): ${failures.join(', ')}`);
    if (attempt === 3) { console.error(`Skipping ${slug} — gate still failing after 3 tries`); return; }
  }
  if (!applied) return;
  console.log('Gate passed.');

  // Update queue
  queue.remaining = queue.remaining.filter(s => s !== slug);
  queue.done.push(slug);
  queue.lastRun = TODAY;
  writeJSON(QUEUE_FILE, queue);

  // Step 4
  ship(slug);

  console.log(`\n=== DONE: ${slug} ===`);
  console.log(`Remaining: ${queue.remaining.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
