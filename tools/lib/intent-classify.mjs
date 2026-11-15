/**
 * intent-classify.mjs — CANONICAL keyword-intent classifier for the calc pipeline.
 *
 * Every per-niche analyzer (analyze_<niche>.mjs) MUST import classifyIntent / classifyCluster
 * from here. Do NOT hand-roll a per-niche intent labeler — that is how the MAT-vs-INSTALLED
 * split was missed for lawn-garden (a 3-bucket COST/COMPUTE/INFO shortcut collapsed
 * "sod cost" [MAT] and "sod installation cost" [INSTALLED] into one "COST" tag).
 *
 * Intent === scope (matches the `scope` field on PageRecord): one entity splits into these,
 * and the SAME set recurs in every sub-niche (gravel cost = MAT, gravel driveway cost = INSTALLED):
 *   INSTALLED — project/installed cost: material + labor ("sod installation cost", "cost to lay sod",
 *               "gravel driveway cost", "patio cost") → installed-project template
 *   SERVICE   — labor-only service ("lawn mowing cost", "tree removal cost", "repair cost")
 *   RATE      — application rate / coverage ("fertilizer per 1,000 sq ft", "seed per acre", "spacing")
 *   MAT       — material price only ("sod cost", "topsoil price per yard", "pallet of sod")
 *   COMPUTE   — quantity needed ("sod calculator", "how much sod", "how many bags")
 *   INFO      — chart / spec / guide ("NPK formula", "soil pH chart"), no calculator
 *
 * Order matters: a keyword can match several signals; the FIRST match in this priority wins.
 */

const RX = {
  INSTALLED: /\binstall(ed|ation|ing)?\b|\bcost to (lay|install|build|pour|pave|put|replace)\b|\b(to lay|laying|installed) (sod|turf|tile|floor|carpet|pavers?)\b|\blabou?r (cost|rate)\b|\bper (sq ?ft|square foot) installed\b|\b(driveway|patio|walkway|deck|fence|wall|roof) cost\b|\binstalled cost\b/i,
  SERVICE:   /\b(mowing|mow|removal|remove|cleaning|clean|repair|maintenance|service|haul(ing|away)?|delivery|grading|aeration|aerate|trimming|pruning) (cost|price|prices|rates?)\b|\bcost (of|to) (mow|remove|clean|repair|haul|grade|aerate|trim|prune)/i,
  RATE:      /\bper (1,?000|sq ?ft|square (foot|feet|yard)|acre|gallon|100 (sq|square))\b|\bapplication rate\b|\bcoverage\b|\bseeds? per\b|\bplants? per\b|\bspacing\b|\b(lb|lbs|pounds?|oz) per\b|\brate (calculator|chart|per)\b/i,
  MAT:       /\bcost\b|\bprice(s|d)?\b|\bpricing\b|\$|\bhow much (is|are|for|does .*cost)\b|\bper (ton|yard|cubic yard|cu ?yd|bag|pallet|roll|board foot|bundle|sheet|piece|linear (ft|foot))\b/i,
  COMPUTE:   /\bcalculator\b|\bcalc\b|\bhow (much|many)\b|\bneeded\b|\bestimat(e|or)\b|\bconvert(er)?\b|\bhow to (calculate|measure|figure)\b/i,
};

export function classifyIntent(kw) {
  const k = (kw || '').toLowerCase();
  // Order: INSTALLED > SERVICE > MAT > RATE > COMPUTE > INFO.
  // MAT is checked BEFORE RATE so price-per-area ("sod cost per sq ft") classifies as
  // material price, not as an application RATE. RATE's "per (sq ft|acre)" only wins when
  // no price/cost token is present (a true application rate like "fertilizer per acre").
  if (RX.INSTALLED.test(k)) return 'INSTALLED';
  if (RX.SERVICE.test(k)) return 'SERVICE';
  if (RX.MAT.test(k)) return 'MAT';
  if (RX.RATE.test(k)) return 'RATE';
  if (RX.COMPUTE.test(k)) return 'COMPUTE';
  return 'INFO';
}

/**
 * Demand-weighted intent for a cluster of {kw, vol} members.
 * Returns { intent, mix } where mix is the per-intent demand breakdown (so a cluster that
 * straddles two intents is visible, not silently flattened).
 */
export function classifyCluster(members) {
  const mix = {};
  for (const m of members) {
    const it = classifyIntent(m.kw);
    mix[it] = (mix[it] || 0) + (m.vol || 0);
  }
  const intent = Object.entries(mix).sort((a, b) => b[1] - a[1])[0]?.[0] || 'INFO';
  return { intent, mix };
}

export const INTENT_TEMPLATE = {
  INSTALLED: 'installed-project-cost',
  SERVICE:   'service-cost',
  RATE:      'rate-coverage',
  MAT:       'material-cost',
  COMPUTE:   'quantity-needed',
  INFO:      'spec-chart',
};
