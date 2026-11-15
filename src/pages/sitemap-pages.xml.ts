// src/pages/sitemap-pages.xml.ts — static + ledger-driven + DB-driven pages
export const prerender = false;

import type { APIRoute } from 'astro';
import creatorData from '../lib/creators-data.json';
import { getDb } from '../lib/db';
import { loadLedger } from '../lib/ledger';
import { getContent } from '../lib/page-content';
import contentStore from '../lib/asmr-page-content.json';

const SITE = 'https://asmrregistry.com';

export const GET: APIRoute = async () => {
  const urls: { loc: string; priority: string; lastmod?: string }[] = [
    { loc: '/', priority: '1.0' },
    { loc: '/about/', priority: '0.5' },
    { loc: '/methodology/', priority: '0.5' },
    // ponytail: /search/ is a utility page, not a content page — excluded from sitemap
    { loc: '/guides/', priority: '0.7' },
    { loc: '/best/', priority: '0.7' },
    { loc: '/gear/', priority: '0.7' },
    { loc: '/asmr-videos/', priority: '0.9' },
    { loc: '/tools/soundscape/', priority: '0.7' },
  ];

  // All ledger pages — exclude CREATOR_NAV and AdSense policy-violating slugs
  const ledger = loadLedger();
  const ADSENSE_BLOCKED = new Set(["ahegao-asmr","asmr-adult","asmr-ass","asmr-bj","asmr-cei","asmr-dirty","asmr-erome","asmr-feet","asmr-femdom","asmr-footjob","asmr-hfo","asmr-licking","asmr-pleasure","asmr-pmv","asmr-smut","asmr-topless","ass-asmr","ballbusting-asmr","bj-asmr","bl-asmr","cuck-asmr","cuckold-asmr","cunnilingus-asmr","dirty-asmr","explicit-asmr","facesitting-asmr","feet-asmr","femboy-asmr","femdom-asmr","fingering-asmr","footjob-asmr","freaky-asmr","gay-asmr","gooner-asmr","gooning-asmr","hfo-asmr","horny-asmr","incest-asmr","intimate-asmr","jav-asmr","lesbian-asmr","ntr-asmr","pawg-asmr","pegging-asmr","rape-asmr","scat-asmr","seductive-asmr","sexiest-asmr","sissy-asmr","smut-asmr","sph-asmr","srp-asmr","threesome-asmr","tits-asmr","titty-asmr","topless-asmr","vore-asmr"]);

  for (const page of ledger.pages) {
    if (page.pageType === 'CREATOR_NAV') continue;
    if (ADSENSE_BLOCKED.has(page.slug)) continue;
    const content = getContent(page.slug);
    if (!content || content.status !== 'published') continue;

    const priority = page.pageType === 'TRIGGER_HUB' || page.pageType === 'INTENT_HUB'
      ? '0.9'
      : page.pageType === 'INFO_GUIDE'
      ? '0.8'
      : '0.7';

    urls.push({
      loc: page.targetUrl,
      priority,
      lastmod: content?.lastUpdated?.split('T')[0],
    });
  }

  // Published pages served by [slug].astro that aren't in the ledger
  const ledgerSlugs = new Set(ledger.pages.map(p => p.slug));
  const store = contentStore as Record<string, { status?: string; lastUpdated?: string }>;
  for (const [slug, page] of Object.entries(store)) {
    if (page.status !== 'published') continue;
    if (ledgerSlugs.has(slug)) continue; // already included via ledger loop
    if (ADSENSE_BLOCKED.has(slug)) continue;
    urls.push({ loc: `/${slug}/`, priority: '0.7', lastmod: page.lastUpdated?.split('T')[0] });
  }

  // Creators come from the build snapshot, so a database outage cannot remove them from the sitemap.
  for (const [slug, c] of Object.entries(creatorData as Record<string, any>)) {
    urls.push({ loc: `/creators/${slug}/`, priority: '0.8', lastmod: c.updated ? new Date(c.updated).toISOString().split('T')[0] : undefined });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${SITE}${u.loc}</loc>
    <priority>${u.priority}</priority>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
};
