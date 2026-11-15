// Rules every creator bio must pass (.claude/prompts/creator-master-prompt.txt). Used by tools/truth-gate.mjs and the
// daily autopilot, so a page can only publish through one definition of "good enough".
const BANNED = /\b(popular|famous|best|top|prolific|legendary|beloved|talented|quality|iconic|subscribers?|views|tested|reviewed|fans say|furthermore|moreover|delve|crucial|vital|essential|robust|seamless|holistic)\b/i;
const INTERNAL = /\b(intent mix|style labels?|tagged|modifiers?|triggerShare|data pack|classified as)\b/i;
// Health-claim titles never appear in our lists (hubs, finder, creator pages): "cure", "relief", "treated", Hz healing.
export const CLAIM = /\bcures?\b|\brelief\b|\btreat(ed|s|ment)?\b|healing|\d+(\.\d+)? ?hz\b|guaranteed|no surgery/i;
// Owner 2026-11-15 ("Adult and etc is fine"): suggestive ASMR is allowed. SUGGESTIVE now blocks only what stays banned
// whatever the owner decides: anything sexual with minors, and explicit content. Every list imports this one rule.
export const SUGGESTIVE = /\b(1[0-7]|[1-9]) ?(yo|y\/o|years? old)\b|\bunderage\b|\bminors?\b|\bloli|\bschool ?girl|\bteen(s|ager)?\b|\bnude|\bnaked|\bporn|\bsex\b|\bsexual|\bnsfw\b|onlyfans|\bexplicit\b/i;
// The old, wider list: adult-leaning but legal. Used only where kids could land (site-wide related links, footer).
export const ADULT = /kiss|\blick|girlfriend|boyfriend|making out|spicy|seduc|flirt|sexy|cuddl|lingerie|bikini|moan|nsfw|18\+/i;
const PERSONAL = /\b(years old|born in|lives in|his wife|her husband|boyfriend|girlfriend|married|real name|nationality)\b/i;

// "around 20 minutes" style claims, as numbers. Used by the gate and by prebuild-creators to catch drift.
const WORDS = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 };
const LENGTH_CLAIM = /\b(?:around|about|roughly|usually|typically|average of|typical)\s+(\d+|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty)\s+minutes?/gi;
// Only sentences about the channel's typical length count ("videos usually run around 20 minutes"). A sentence about
// one named video ("X runs about 21 minutes") is checked against that video instead, in tools/truth-gate.mjs.
const CHANNEL = /\b(usually|typically|on average|average|median|tend to|most (of )?(their |the )?(videos|uploads))\b/i;
export const lengthClaims = (bio) => String(bio).split(/(?<=[.!?])\s+/).filter((s) => CHANNEL.test(s))
  .flatMap((s) => [...s.matchAll(LENGTH_CLAIM)].map((m) => [m[0], /^\d+$/.test(m[1]) ? +m[1] : WORDS[m[1].toLowerCase()]]));
export const wrongLength = (bio, median) => lengthClaims(bio).filter(([, n]) => Math.abs(n - median) > Math.max(3, median * 0.2));

// Bios are written once, the catalog keeps growing. On every build, restate the drifting facts from live data:
// video count, upload years, and any length claim that is now off.
export function refreshBio(bio, c) {
  let out = String(bio)
    .replace(/\b(holds|have|has|includes) (only )?\d[\d,]* (of their videos|videos)/gi, (m, verb, only, rest) => `${verb} ${c.count < 30 ? 'only ' : ''}${c.count} ${rest}`)
    .replace(/\bbetween (?:[A-Z][a-z]+ )?(19|20)\d{2} and (?:[A-Z][a-z]+ )?(19|20)\d{2}/g, () => (c.firstYear === c.lastYear ? `in ${c.lastYear}` : `between ${c.firstYear} and ${c.lastYear}`));
  for (const [text] of wrongLength(out, c.medianMin)) out = out.replace(text, text.replace(/\S+(\s+minutes?)$/i, `${c.medianMin}$1`));
  return out;
}

export function gateBio(b, p, dead = []) {
  const fails = [];
  const bio = b.editorial_bio || '';
  const paras = bio.split(/\n\s*\n/).filter(x => x.trim());
  const words = bio.split(/\s+/).filter(Boolean).length;
  if (paras.length !== 4) fails.push(`${paras.length} paragraphs (need 4)`);
  if (words < 170 || words > 280) fails.push(`${words} words (170-280)`);
  const nums = bio.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  if (nums.length > 4) fails.push(`${nums.length} numbers (max 4): ${nums.join(' ')}`);
  const p1nums = (paras[0] || '').match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  if (p1nums.length > 1) fails.push(`paragraph 1 has ${p1nums.length} numbers (max 1)`);
  if ((bio.match(/percent|%/gi) || []).length > 1) fails.push('percentage dump (max 1 percent mention)');
  if (/[—–]|--/.test(bio)) fails.push('dash');
  let m;
  if ((m = bio.match(BANNED))) fails.push(`banned word "${m[0]}"`);
  if ((m = bio.match(INTERNAL))) fails.push(`internal jargon "${m[0]}"`);
  if ((m = bio.match(PERSONAL))) fails.push(`personal detail "${m[0]}"`);
  if ((m = bio.match(SUGGESTIVE))) fails.push(`suggestive word "${m[0]}"`);
  // Every digit in a bio must exist in the pack. Key names stay in on purpose: shareOver30Min allows "over 30 minutes".
  const known = new Set(JSON.stringify(p, (k, v) => (k === 'id' || k === 'channel_id' ? undefined : v)).match(/\d+(?:\.\d+)?/g) || []);
  for (const n of nums) if (!known.has(n.replace(/,/g, ''))) fails.push(`number ${n} is not in the data`);
  for (const [text] of wrongLength(bio, p.medianMinutes)) fails.push(`"${text}" but the median is ${p.medianMinutes} minutes`);
  // Spelled-out numbers ("sixteen minutes") would skip the check above, so they must be written as digits.
  if ((m = bio.match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b/i))) fails.push(`spelled-out number "${m[0]}" (write digits so they can be checked)`);
  for (const n of dead) if (bio.includes(n)) fails.push(`mentions unpublished creator "${n}"`);
  const top = new Map((p.topVideos || []).map(v => [v.id, v.title]));
  const sig = b.signature_videos || [];
  if (sig.length < 2 || sig.length > 3) fails.push(`${sig.length} signature videos (2-3)`);
  for (const id of sig) {
    if (!top.has(id)) fails.push(`signature ${id} not in topVideos`);
    else if (SUGGESTIVE.test(top.get(id))) fails.push(`signature title suggestive: ${top.get(id).slice(0, 50)}`);
  }
  const shares = Object.fromEntries((p.triggerShare || []).map(t => [t.trigger, t.pct]));
  for (const t of b.trigger_specialties || []) {
    if (!(shares[t] >= 10)) fails.push(`specialty ${t} under 10% or absent`);
    if (t === 'kisses') fails.push('kisses may not be a specialty');
  }
  const tags = b.style_tags || [];
  if (tags.length < 3 || tags.length > 6) fails.push(`${tags.length} style tags (3-6)`);
  return fails;
}

// Title trigger rules shared by the creator builder and the creator video page (one list, so chips, counts and
// "more like this" always agree). public/js/creator-tools.js keeps a copy with the same keys (browser file).
export const TRIG = { whispering: /whisper/i, tapping: /tap(ping)?\b/i, 'mouth sounds': /mouth sound/i, 'ear cleaning': /ear clean/i, 'ear licking': /ear lick|licking/i, kisses: /kiss/i, massage: /massage/i, 'hair play': /hair (play|brush)|scalp/i, 'personal attention': /personal attention|pampering/i, roleplay: /role ?play|\brp\b/i, 'soft spoken': /soft[ -]?spoken/i, 'no talking': /no talking/i, eating: /eating|mukbang/i, rain: /\brain\b/i, scratching: /scratch/i, 'face touching': /face touch/i, sleep: /sleep/i, binaural: /binaural|3dio|ku ?100/i };
