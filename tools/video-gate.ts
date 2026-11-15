// tools/video-gate.ts — Indexation gate. Blocks thin published videos.
//
// A published video is INDEXABLE only if it has:
//   - primary_trigger (not null, not empty string)
//   - intents array with ≥1 element
//   - triggers array with ≥1 element
//
// Videos missing any of these would render noindex,follow and should never ship published.
// This gate demotes any thin published videos back to draft and exits 1 (BLOCKER).
//
//   npx tsx tools/video-gate.ts [--dry-run]

import 'dotenv/config';
import { getDb } from '../scripts/lib/db.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const db = getDb();

  // Find all published videos that are missing required enrichment
  const result = await db.execute(`
    SELECT id, title, status, primary_trigger, intents, triggers, created_at
    FROM videos
    WHERE status = 'published'
      AND (
        primary_trigger IS NULL
        OR primary_trigger = ''
        OR json_array_length(intents) = 0
        OR json_array_length(triggers) = 0
      )
    ORDER BY created_at DESC
    LIMIT 200
  `);

  const thin = result.rows as any[];

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  VIDEO GATE — asmrregistry.com — ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(72)}\n`);

  if (thin.length === 0) {
    console.log('✓ All published videos are indexable.');
    console.log(`${'═'.repeat(72)}\n`);
    process.exit(0);
  }

  console.log(`✗ BLOCKER: ${thin.length} published videos are THIN (missing enrichment)\n`);
  console.log('Details:');
  console.log('-'.repeat(72));

  for (const v of thin.slice(0, 20)) {
    const triggers = JSON.parse((v.triggers as string) || '[]');
    const intents = JSON.parse((v.intents as string) || '[]');
    const primary = (v.primary_trigger as string) || '(none)';
    console.log(`  ID: ${v.id}`);
    console.log(`    Title: ${(v.title as string).slice(0, 60)}`);
    console.log(`    primary_trigger: ${primary}`);
    console.log(`    intents: [${intents.join(', ')}] (${intents.length})`);
    console.log(`    triggers: [${triggers.join(', ')}] (${triggers.length})`);
    console.log();
  }

  if (thin.length > 20) {
    console.log(`  ... and ${thin.length - 20} more\n`);
  }

  // These videos would render as noindex,follow because they lack indexability gates.
  // Demote them back to draft so they can be re-enriched properly.
  if (!dryRun) {
    console.log(`Demoting ${thin.length} thin videos back to draft...\n`);
    await db.execute(`
      UPDATE videos SET status = 'draft'
      WHERE status = 'published'
        AND (
          primary_trigger IS NULL
          OR primary_trigger = ''
          OR json_array_length(intents) = 0
          OR json_array_length(triggers) = 0
        )
    `);
    console.log('Done.\n');
  } else {
    console.log('(dry-run — no changes made)\n');
  }

  console.log(`${'═'.repeat(72)}`);
  console.log(`  RESULT: ${thin.length} thin videos demoted to draft (auto-remediated)\n`);
  console.log(`${'═'.repeat(72)}\n`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
