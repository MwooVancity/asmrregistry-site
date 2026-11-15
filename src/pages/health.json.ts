// src/pages/health.json.ts
import type { APIRoute } from 'astro';
import { getDb } from '../lib/db';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const db = getDb();
    const result = await db.execute(`SELECT value FROM cron_state WHERE key = 'last_successful_run'`);
    const lastRun = (result.rows[0]?.value as string) || '';
    const staleHours = lastRun ? (Date.now() - new Date(lastRun).getTime()) / 3600000 : Infinity;
    return new Response(JSON.stringify({ ok: staleHours < 26, staleHours: Math.round(staleHours * 10) / 10, lastRun }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'db_unavailable' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
