// Re-derive primary_trigger/triggers for published videos with the fixed matcher (title outranks description).
// Keeps the existing value when the matcher finds nothing (that value came from the classifier).
// Usage: npx tsx scripts/retag-triggers.ts            (dry run: counts + sample, writes SQL file)
//        npx tsx scripts/retag-triggers.ts --apply    (also executes the SQL against remote D1)
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { getDb } from './lib/db';
import { matchTriggers } from './lib/enrichment';

const APPLY = process.argv.includes('--apply');
const OUT = process.env.TEMP ? `${process.env.TEMP}/retag.sql` : 'retag.sql';
const db = getDb();
const rows = (await db.execute(`SELECT id, title, description, primary_trigger, triggers FROM videos WHERE status = 'published'`)).rows as any[];

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const changes: { id: string; title: string; from: string; to: string; triggers: string[] }[] = [];
for (const r of rows) {
  const t = matchTriggers(r.title || '', r.description || undefined);
  if (!t.length) continue;
  if (t[0] !== r.primary_trigger || JSON.stringify(t) !== (r.triggers || '[]')) {
    changes.push({ id: r.id, title: r.title, from: r.primary_trigger || '', to: t[0], triggers: t });
  }
}
const primaryChanged = changes.filter(c => c.from !== c.to);
console.log(`published: ${rows.length} | rows to update: ${changes.length} | primary trigger changes: ${primaryChanged.length}`);
const moves: Record<string, number> = {};
for (const c of primaryChanged) moves[`${c.from || '(blank)'} -> ${c.to}`] = (moves[`${c.from || '(blank)'} -> ${c.to}`] || 0) + 1;
console.log('top moves:', Object.entries(moves).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}: ${n}`).join(' | '));
console.log('sample:');
for (const c of primaryChanged.sort(() => Math.random() - 0.5).slice(0, 15)) console.log(`  ${(c.from || '(blank)').padEnd(16)} -> ${c.to.padEnd(16)} ${c.title.slice(0, 70)}`);

writeFileSync(OUT, changes.map(c => `UPDATE videos SET primary_trigger = ${q(c.to)}, triggers = ${q(JSON.stringify(c.triggers))} WHERE id = ${q(c.id)};`).join('\n'));
console.log(`SQL: ${OUT}`);
if (APPLY && changes.length) {
  execSync(`npx wrangler d1 execute asmr-registry --remote --file "${OUT}" -y`, { stdio: 'inherit' });
}
