// Runs first in every build (2026-11-15: a laptop deploy with 53 local creator files took 90 live creators down).
// Pulls the creator-data branch into public/creator-data so any build, laptop or CI, ships every creator.
// No network or no branch = the build stops, never deploys a partial set.
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
const sh = (c) => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
try {
  sh('git fetch --depth 1 origin creator-data');
  mkdirSync('public/creator-data', { recursive: true });
  sh('git --work-tree=public/creator-data checkout FETCH_HEAD -- .');
  sh('git reset -q');
} catch (e) {
  console.error('load-creator-data: could not load the creator-data branch, build stopped so no creators get removed.\n' + e.message);
  process.exit(1);
}
const n = readdirSync('public/creator-data').filter((f) => f.endsWith('.json')).length;
const onBranch = sh('git ls-tree --name-only FETCH_HEAD').split('\n').filter((f) => f.endsWith('.json')).length;
if (n < onBranch) { console.error(`load-creator-data: ${n} files here, ${onBranch} on the branch. Stopped.`); process.exit(1); }
console.log(`load-creator-data: ${n} creator files ready`);
