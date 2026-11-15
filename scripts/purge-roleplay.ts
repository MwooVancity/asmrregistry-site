// scripts/purge-roleplay.ts — one-time: remove roleplay_hub rows (pages deleted in v16)
import { getDb } from './lib/db';

const db = getDb();

const pages = await db.execute(`DELETE FROM active_pages WHERE page_type = 'roleplay_hub'`);
const hubs = await db.execute(`DELETE FROM hub_intelligence WHERE hub_slug LIKE 'roleplay/%'`);
console.log(`Purged ${pages.rowsAffected} active_pages rows, ${hubs.rowsAffected} hub_intelligence rows.`);
