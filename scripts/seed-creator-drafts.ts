// scripts/seed-creator-drafts.ts — seed creator_profiles DRAFT rows for the
// top 20 creators by published video count. No editorial content here (that's
// the Opus convo's job); these rows stay status='draft' = pages stay 404.
import { getDb } from './lib/db';

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function main() {
  const db = getDb();

  const top = await db.execute(`
    SELECT channel_id, channel_name, COUNT(*) AS cnt
    FROM videos WHERE status = 'published' AND channel_name IS NOT NULL AND channel_name != ''
    GROUP BY channel_id ORDER BY cnt DESC LIMIT 20
  `);

  let seeded = 0;
  for (const r of top.rows) {
    const name = r.channel_name as string;
    const slug = slugify(name);
    if (!slug) continue;
    await db.execute({
      sql: `INSERT OR IGNORE INTO creator_profiles (slug, channel_id, name, status, created_at, updated_at)
            VALUES (?, ?, ?, 'draft', datetime('now'), datetime('now'))`,
      args: [slug, r.channel_id as string, name],
    });
    seeded++;
    console.log(`${slug}  (${r.cnt} videos)  ${r.channel_id}`);
  }
  console.log(`\nSeeded ${seeded} draft creator_profiles rows.`);
}
main();
