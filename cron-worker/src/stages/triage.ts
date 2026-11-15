// cron-worker/src/stages/triage.ts — Lightweight DB-side health checks.
// Runs as a cron stage. Checks dedup rate, video completeness, thin creators.
// No HTTP requests (stays under 50-subrequest cap).

import type { Client } from '../d1-adapter';

interface TriageResult {
  dupPairs: number;
  dupRate: number;
  dupDemoted: number;
  missingWhyWatch: number;
  missingTrigger: number;
  thinCreators: number;
  published: number;
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = Array(b.length + 1).fill(0).map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
    }
  }
  return matrix[b.length][a.length];
}

export async function runTriage(db: Client): Promise<TriageResult> {
  const pubRes = await db.execute(
    `SELECT id, title, channel_id, view_count FROM videos WHERE status = 'published' ORDER BY id`
  );
  const videos = pubRes.rows;

  // Dedup: same-channel title similarity >95%
  const dupPairsToFix: { dupId: string; keepId: string }[] = [];
  for (let i = 0; i < videos.length; i++) {
    for (let j = i + 1; j < videos.length; j++) {
      const a = videos[i], b = videos[j];
      if (a.channel_id !== b.channel_id) continue;
      const ta = ((a.title as string) || '').toLowerCase();
      const tb = ((b.title as string) || '').toLowerCase();
      const maxLen = Math.max(ta.length, tb.length);
      if (maxLen === 0) continue;
      const sim = 1 - levenshtein(ta, tb) / maxLen;
      if (sim > 0.95) {
        const aViews = Number(a.view_count ?? 0);
        const bViews = Number(b.view_count ?? 0);
        dupPairsToFix.push(
          aViews <= bViews
            ? { dupId: a.id as string, keepId: b.id as string }
            : { dupId: b.id as string, keepId: a.id as string }
        );
      }
    }
  }

  const dupRate = videos.length > 0 ? dupPairsToFix.length / videos.length : 0;

  // Auto-demote when rate >10%
  let dupDemoted = 0;
  if (dupRate > 0.10) {
    for (const p of dupPairsToFix) {
      await db.execute({
        sql: `UPDATE videos SET status = 'draft' WHERE id = ? AND status = 'published'`,
        args: [p.dupId],
      });
      dupDemoted++;
    }
  }

  // Missing fields
  const whyRes = await db.execute(
    `SELECT COUNT(*) as cnt FROM videos WHERE status = 'published' AND (why_watch IS NULL OR why_watch = '')`
  );
  const trigRes = await db.execute(
    `SELECT COUNT(*) as cnt FROM videos WHERE status = 'published' AND (primary_trigger IS NULL OR primary_trigger = '')`
  );

  // Thin creators
  const crRes = await db.execute(
    `SELECT COUNT(*) as cnt FROM creator_profiles WHERE status = 'published' AND length(editorial_bio) < 1500`
  );

  return {
    dupPairs: dupPairsToFix.length,
    dupRate: Math.round(dupRate * 1000) / 10,
    dupDemoted,
    missingWhyWatch: Number(whyRes.rows[0]?.cnt ?? 0),
    missingTrigger: Number(trigRes.rows[0]?.cnt ?? 0),
    thinCreators: Number(crRes.rows[0]?.cnt ?? 0),
    published: videos.length,
  };
}
