// tools/notify.ts
// Fire-and-forget Discord notifier. Posts to the webhook in DISCORD_WEBHOOK_URL.
// No-ops silently when the env var is unset, so it is always safe to call.
// Never throws — a notification failure must not fail the work it reports on.

const DISCORD_LIMIT = 2000; // Discord rejects messages over 2000 chars

export async function notifyDiscord(message: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  const content = message.length > DISCORD_LIMIT ? message.slice(0, DISCORD_LIMIT - 1) + '…' : message;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, username: 'cascade' }),
    });
    if (!res.ok) {
      process.stderr.write(`notify: Discord returned ${res.status}\n`);
    }
  } catch (err) {
    process.stderr.write(`notify: ${(err as Error).message}\n`);
  }
}

// CLI: `tsx tools/notify.ts "message"` — used to ping ad-hoc (e.g. when a
// long-running background job finishes outside the cascade orchestrator).
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  config({ path: resolve(__filename, '..', '..', '.env') });
  const msg = process.argv.slice(2).join(' ') || 'cascade: ping';
  notifyDiscord(msg).then(() => process.exit(0));
}
