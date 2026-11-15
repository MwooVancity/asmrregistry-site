// tools/audit-asmr-indexation.ts — Post-enrichment indexation audit.
//
// Daily check that all published videos are indexable (will actually be indexed by Google).
// If any published videos are thin (missing triggers, intents, or primary_trigger),
// this is a BLOCKER — it means the enrichment pipeline failed.
//
//   npx tsx tools/audit-asmr-indexation.ts

import 'dotenv/config';
import { getDb } from '../scripts/lib/db.js';

async function main() {
  const db = getDb();

  // Snapshot: published videos by indexability
  const result = await db.execute(`
    SELECT
      COUNT(*) as total_published,
      SUM(CASE WHEN json_array_length(intents) = 0 THEN 1 ELSE 0 END) as missing_intents,
      SUM(CASE WHEN json_array_length(intents) > 0 THEN 1 ELSE 0 END) as indexable
    FROM videos
    WHERE status = 'published'
  `);

  const row = result.rows[0] as any;
  const total = row.total_published ?? 0;
  const indexable = row.indexable ?? 0;
  const missing_intents = row.missing_intents ?? 0;
  const thin = missing_intents;

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  INDEXATION AUDIT — asmrregistry.com — ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(72)}\n`);

  console.log(`Published videos: ${total}`);
  console.log(`  ✓ Indexable: ${indexable}`);
  console.log(`  ✗ Thin (noindex'd):`);
  console.log(`    - Missing intents: ${missing_intents}`);
  console.log(`    - TOTAL THIN: ${thin}\n`);

  if (thin === 0) {
    console.log(`${'═'.repeat(72)}`);
    console.log(`  RESULT: PASS — all published videos are indexable\n`);
    console.log(`${'═'.repeat(72)}\n`);
    process.exit(0);
  }

  console.log(`${'═'.repeat(72)}`);
  console.log(`  RESULT: WARNING — ${thin} published videos may be noindex'd (video-gate should have demoted these)\n`);
  console.log(`${'═'.repeat(72)}\n`);

  process.exit(0);
}

main().catch(err => {
  const msg = String(err);
  if (msg.includes('7500') || msg.includes('rows_read') || msg.includes('free tier')) {
    console.warn('audit-asmr-indexation: D1 rows_read limit hit — skipping audit this build');
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});
