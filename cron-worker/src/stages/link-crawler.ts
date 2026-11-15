// cron-worker/src/stages/link-crawler.ts
// Stage 1: Crawl live pillar pages, extract external hrefs → link_checks table
import type { Client } from '../d1-adapter';

const SITE_BASE = 'https://asmrregistry.com';

const PILLAR_SLUGS = [
  '/what-is-asmr/', '/asmr-science/', '/asmr-triggers/', '/does-asmr-work/',
  '/asmr-for-anxiety/', '/best-asmr-creators/', '/about/', '/methodology/',
  '/asmr-for-adhd/', '/asmr-for-depression/', '/asmr-for-headache/',
  '/asmr-for-insomnia/', '/asmr-for-kids/', '/asmr-for-studying/', '/asmr-for-tinnitus/',
  '/asmr-history/', '/asmr-statistics/', '/asmr-tingles/', '/asmr-vs-meditation/',
  '/binaural-asmr/', '/eating-asmr/', '/hair-asmr/', '/korean-asmr/',
  '/long-asmr-videos/', '/nature-asmr/', '/no-talking-asmr/', '/rain-asmr/',
  '/soft-speaking-asmr/', '/tapping-asmr/', '/whispering-asmr/', '/roleplay-asmr/',
];

export async function runLinkCrawler(db: Client): Promise<{ pagesScanned: number; linksFound: number; newLinks: number }> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS link_checks (
      source_page TEXT NOT NULL,
      target_url  TEXT NOT NULL,
      anchor_text TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      status_code INTEGER,
      checked_at  DATETIME,
      created_at  DATETIME DEFAULT (datetime('now')),
      PRIMARY KEY (source_page, target_url)
    )
  `);

  let pagesScanned = 0, linksFound = 0, newLinks = 0;

  for (const slug of PILLAR_SLUGS) {
    try {
      const res = await fetch(SITE_BASE + slug, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ASMRRegistry-LinkBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;

      const html = await res.text();
      const links = extractExternalLinks(html, slug);
      linksFound += links.length;

      for (const { href, anchor } of links) {
        // Skip if already checked in last 30 days
        const row = await db.execute({
          sql: `SELECT checked_at FROM link_checks WHERE source_page = ? AND target_url = ?`,
          args: [slug, href],
        });
        if (row.rows.length > 0 && row.rows[0].checked_at) {
          const agedays = (Date.now() - new Date(row.rows[0].checked_at as string).getTime()) / 86400000;
          if (agedays < 30) continue;
        }

        await db.execute({
          sql: `INSERT INTO link_checks (source_page, target_url, anchor_text, status, created_at)
                VALUES (?, ?, ?, 'pending', datetime('now'))
                ON CONFLICT(source_page, target_url) DO UPDATE SET status='pending', checked_at=NULL`,
          args: [slug, href, anchor],
        });
        newLinks++;
      }

      pagesScanned++;
    } catch {
      // Skip pages that fail (site may be starting up, etc.)
    }
  }

  return { pagesScanned, linksFound, newLinks };
}

function extractExternalLinks(html: string, sourcePage: string): { href: string; anchor: string }[] {
  const results: { href: string; anchor: string }[] = [];
  const seen = new Set<string>();

  // Match full <a> tags to capture both href and anchor text together
  const tagRegex = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    const href = match[1].trim();
    const anchor = match[2].replace(/<[^>]+>/g, '').trim().slice(0, 200);

    if (!isExternal(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    results.push({ href, anchor });
  }

  return results;
}

function isExternal(href: string): boolean {
  if (!href.startsWith('http://') && !href.startsWith('https://')) return false;
  if (href.includes('asmrregistry.com')) return false;
  // YouTube links handled by dead-check stage
  if (href.includes('youtube.com') || href.includes('youtu.be')) return false;
  return true;
}
