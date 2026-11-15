// Picks today's creator-engine work: files older than 25 days first (YouTube 30-day rule), then the next unbuilt
// channels from state/creator-queue.json, up to --new (default 100). Prints channel IDs for tools/creator-build.mjs.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
const args = process.argv.slice(2);
const NEW = args.includes('--new') ? Number(args[args.indexOf('--new') + 1]) : 100;
const DIR = 'public/creator-data';
const have = new Map();
if (existsSync(DIR)) for (const f of readdirSync(DIR)) { try { const d = JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')); have.set(d.channel.id, d.fetched); } catch {} }
const stale = [...have].filter(([, f]) => Date.now() - Date.parse(f) > 25 * 864e5).map(([id]) => id);
const queue = JSON.parse(readFileSync('state/creator-queue.json', 'utf8')).map((c) => c.id).filter((id) => !have.has(id));
console.log([...stale, ...queue.slice(0, NEW)].join(' '));
