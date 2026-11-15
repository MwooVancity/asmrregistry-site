import { getDb } from './lib/db';

const db = getDb();

const pub = await db.execute("SELECT COUNT(*) as cnt FROM videos WHERE status='published'");
// Check active_pages schema first
const schema = await db.execute("PRAGMA table_info(active_pages)");
console.log('active_pages columns:', schema.rows.map((r: any) => r.name).join(', '));

const pages = await db.execute("SELECT COUNT(*) as cnt FROM active_pages");
const eligible = await db.execute("SELECT COUNT(*) as cnt FROM active_pages WHERE sitemap_eligible=1");
const topCombos = await db.execute("SELECT * FROM active_pages ORDER BY rowid DESC LIMIT 5");

console.log('Published videos:', pub.rows[0].cnt);
console.log('Active pages:', pages.rows[0].cnt);
console.log('Sitemap eligible:', eligible.rows[0].cnt);
console.log('Sample active_pages rows:', JSON.stringify(topCombos.rows, null, 2));
process.exit(0);
