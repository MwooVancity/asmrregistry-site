import { getDb } from '../src/lib/db';
import { checkIndexFreshness } from '../src/lib/gates/search-index-freshness';

export async function runSearchFreshnessCron() {
  const db = getDb();

  console.log('Running search freshness check...');

  try {
    const lastIngestResult = await db.execute(
      `SELECT MAX(indexed_date) as last_indexed FROM videos WHERE indexed_date IS NOT NULL`
    );

    const lastIndexedStr = (lastIngestResult.rows[0] as any)?.last_indexed;
    const lastTime = lastIndexedStr ? new Date(lastIndexedStr) : new Date();

    const result = await checkIndexFreshness(lastTime);

    if (!result.pass) {
      console.error(
        `🚨 KILL-SWITCH: Index freshness failed! Latency: ${result.latency_seconds}s, Drift: ${result.consistency_drift_pct}%`
      );
      if (result.latency_seconds > 21600) {
        // >6 hours
        console.error('Pausing video publishing...');
        process.exit(1);
      }
    } else {
      console.log(
        `✓ Index fresh: Latency ${result.latency_seconds}s, Drift ${result.consistency_drift_pct}%`
      );
    }
  } catch (error) {
    console.error('Search freshness cron error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSearchFreshnessCron().catch(console.error);
}
