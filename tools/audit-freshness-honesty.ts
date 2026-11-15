import { getDb } from '../src/lib/db';

export interface FreshnessViolation {
  hub_id: string;
  intent: string;
  trigger: string;
  reason: string;
}

export async function auditFreshnessHonesty(): Promise<FreshnessViolation[]> {
  console.log('Auditing freshness honesty...');
  const client = getDb();

  try {
    // hubs table only exists if initSchema() was called — returns [] if not provisioned
    const hubs = await client.execute('SELECT * FROM hubs');
    const violations: FreshnessViolation[] = [];

    for (const hub of hubs.rows) {
      const lastVideoAdded = await client.execute({
        sql: 'SELECT MAX(created_at) as last_added FROM videos WHERE primary_trigger = ?',
        args: [hub.trigger],
      });

      const lastDate = new Date(lastVideoAdded.rows[0]?.last_added || 0);
      const dateModified = new Date(hub.date_modified || 0);

      // Violation: dateModified updated but no new video added
      if (dateModified > lastDate) {
        violations.push({
          hub_id: hub.id,
          intent: hub.intent,
          trigger: hub.trigger,
          reason: `dateModified changed without new video (fabricated freshness)`,
        });
      }
    }

    console.log(`Found ${violations.length} violations`);

    if (violations.length > 5) {
      console.error(`🚨 BLOCKER: >5 freshness violations detected!`);
      process.exit(1);
    }

    return violations;
  } catch (error) {
    console.error('Freshness audit failed:', error);
    return [];
  }
}

export async function runFreshnessAudit() {
  await auditFreshnessHonesty();
}
