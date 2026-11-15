// tools/gsc-classify.mjs — pure WIN/CLOSE/DEAD/NEW classification.
// Telemetry kills PAGES, never standards (factory mandate 4 + law line).
//   WIN   — page 1 and earning clicks: leave alone, study what it does right
//   CLOSE — page 2-3 with real impressions: highest-ROI improvement targets
//   DEAD  — ranked but buried with real impressions: prune-audit candidates
//   NEW   — not enough data to judge: do nothing
const MIN_IMPRESSIONS = 50;

export function classifyPage({ clicks, impressions, position }) {
  if (impressions < MIN_IMPRESSIONS) return 'NEW';
  if (position <= 10 && clicks > 0) return 'WIN';
  if (position <= 30) return 'CLOSE';
  return 'DEAD';
}
