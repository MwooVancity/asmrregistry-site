// tools/dedup-audit.ts — Deduplication audit with auto-demote.
//
// Detects same-channel near-duplicate titles (>95% similarity).
// Auto-demotes lower-view-count duplicate to draft when rate >10%.
// Kill-switch: >15% after auto-demote blocks deployment.
//
//   npx tsx tools/dedup-audit.ts
//   npx tsx tools/dedup-audit.ts --dry-run

import 'dotenv/config';
import { getDb } from '../scripts/lib/db';
import { detectDuplicates } from '../src/lib/gates/deduplication';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const db = getDb();

  const result = await db.execute(`
    SELECT id, title, channel_id, view_count, status
    FROM videos
    WHERE status = 'published'
    ORDER BY id ASC
  `);

  const videos = result.rows as any[];
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  DEDUPLICATION AUDIT — asmrregistry.com — ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(72)}\n`);
  console.log(`Scanning ${videos.length} published videos for duplicates...`);
  if (DRY_RUN) console.log(`  (dry-run mode — no changes will be made)`);
  console.log();

  // Build duplicate pairs (deduplicated — only keep one direction per pair)
  const seen = new Set<string>();
  const dupPairs: { dup: any; canonical: any; score: number }[] = [];

  for (const video of videos) {
    const others = videos.filter(v => v.id !== video.id);
    const dups = await detectDuplicates(video, others);

    for (const d of dups) {
      const pairKey = [video.id, d.canonical_video_id].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const canonical = videos.find(v => v.id === d.canonical_video_id);
      if (!canonical) continue;

      // Lower view count = the one to demote
      const vidViews = Number(video.view_count ?? 0);
      const canViews = Number(canonical.view_count ?? 0);
      if (vidViews <= canViews) {
        dupPairs.push({ dup: video, canonical, score: d.similarity_score });
      } else {
        dupPairs.push({ dup: canonical, canonical: video, score: d.similarity_score });
      }
    }
  }

  const dupRate = videos.length > 0 ? dupPairs.length / videos.length : 0;

  if (dupPairs.length > 0) {
    console.log(`Duplicate pairs found: ${dupPairs.length} (${(dupRate * 100).toFixed(1)}% of ${videos.length})\n`);
    dupPairs.slice(0, 10).forEach(p => {
      console.log(`  • DEMOTE ${p.dup.id} (${Number(p.dup.view_count ?? 0).toLocaleString()} views)`);
      console.log(`    KEEP   ${p.canonical.id} (${Number(p.canonical.view_count ?? 0).toLocaleString()} views)`);
      console.log(`    Score: ${p.score.toFixed(3)}  Channel: ${p.dup.channel_id}\n`);
    });
    if (dupPairs.length > 10) console.log(`  ... and ${dupPairs.length - 10} more\n`);
  }

  // Auto-demote when rate >10%
  let demoted = 0;
  if (dupRate > 0.10 && dupPairs.length > 0) {
    console.log(`Rate ${(dupRate * 100).toFixed(1)}% exceeds 10% — auto-demoting lower-view duplicates...`);
    for (const p of dupPairs) {
      if (DRY_RUN) {
        console.log(`  [dry-run] Would demote ${p.dup.id}`);
        demoted++;
        continue;
      }
      await db.execute({
        sql: `UPDATE videos SET status = 'draft' WHERE id = ? AND status = 'published'`,
        args: [p.dup.id],
      });
      demoted++;
    }
    console.log(`  Demoted ${demoted} videos to draft.\n`);
  }

  // Recalculate after demotions
  const finalCount = videos.length - demoted;
  const remainingDups = DRY_RUN ? dupPairs.length : 0;
  const finalRate = finalCount > 0 ? remainingDups / finalCount : 0;

  if (finalRate > 0.15) {
    console.log(`${'═'.repeat(72)}`);
    console.log(`  BLOCKER: ${(finalRate * 100).toFixed(1)}% duplicates after auto-demote`);
    console.log(`${'═'.repeat(72)}\n`);
    process.exit(1);
  }

  console.log(`${'═'.repeat(72)}`);
  console.log(`  PASS — ${dupPairs.length} pairs found, ${demoted} demoted, ${finalCount} published remain`);
  console.log(`${'═'.repeat(72)}\n`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
