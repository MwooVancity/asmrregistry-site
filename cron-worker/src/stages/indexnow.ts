// cron-worker/src/stages/indexnow.ts — impossible-timeline mandate: push the
// day's newly published, INDEXABLE videos to the index in hours, not weeks.
// Key file served at https://asmrregistry.com/a7f3c9e2b4d8f1a6.txt
import type { Client } from '../d1-adapter';

const INDEXNOW_KEY = 'a7f3c9e2b4d8f1a6';
const SITE = 'https://asmrregistry.com';

export async function runIndexNow(db: Client): Promise<{ submitted: number }> {
  const urlList: string[] = [];

  // 1. Newly published, INDEXABLE videos — mirror the sitemap/indexability gate exactly
  const vids = await db.execute(
    `SELECT id FROM videos
     WHERE status = 'published'
       AND created_at >= datetime('now', '-1 day')
       AND primary_trigger IS NOT NULL AND primary_trigger != ''
       AND intents IS NOT NULL AND intents != '[]' AND intents != ''
       AND triggers IS NOT NULL AND triggers != '[]' AND triggers != ''
     LIMIT 100`
  );
  for (const r of vids.rows) urlList.push(`${SITE}/video/${r.id as string}/`);

  // 2. Recently published/updated editorial pages — the high-authority surfaces.
  //    status='published' already excludes pillar-colliding lists (kept as draft → route 404s).
  const guides = await db.execute(
    `SELECT slug FROM trigger_guides WHERE status='published' AND updated_at >= datetime('now','-1 day')`
  );
  for (const r of guides.rows) urlList.push(`${SITE}/${r.slug as string}-asmr/`);

  const creators = await db.execute(
    `SELECT slug FROM creator_profiles WHERE status='published' AND updated_at >= datetime('now','-1 day')`
  );
  for (const r of creators.rows) urlList.push(`${SITE}/creators/${r.slug as string}/`);

  const lists = await db.execute(
    `SELECT slug FROM curated_lists WHERE status='published' AND updated_at >= datetime('now','-1 day')`
  );
  for (const r of lists.rows) urlList.push(`${SITE}/best/${r.slug as string}/`);

  if (urlList.length === 0) return { submitted: 0 };
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: 'asmrregistry.com',
      key: INDEXNOW_KEY,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
  });
  if (!res.ok && res.status !== 202) {
    console.warn(`IndexNow responded ${res.status}: ${await res.text()}`);
  }
  return { submitted: urlList.length };
}
