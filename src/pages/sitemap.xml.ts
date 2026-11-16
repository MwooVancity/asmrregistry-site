// src/pages/sitemap.xml.ts — sitemap index. Lists every sitemap named in robots.txt (creator, video and category
// sitemaps are written there at build time), so Bing and Google find them all from this one file.
// 2026-11-16: it listed only sitemap-pages.xml, and Bing knew 418 URLs while the site had ~295,000.
export const prerender = false;

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const SITE = 'https://asmrregistry.com';

export const GET: APIRoute = async ({ url }) => {
  let maps = [`${SITE}/sitemap-pages.xml`];
  try {
    const u = new URL('/robots.txt', url);
    const r = (env as any)?.ASSETS ? await (env as any).ASSETS.fetch(u) : await fetch(u);
    const listed = (await r.text()).split(/\r?\n/).map((l) => l.match(/^Sitemap:\s*(\S+)/i)?.[1]).filter((s): s is string => !!s && !/\/sitemap(-index)?\.xml$/.test(s)); // index files are not listed inside an index
    maps = [...new Set([...maps, ...listed])];
  } catch {} // robots.txt unreadable: still serve the pages sitemap
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${maps.map((m) => `  <sitemap><loc>${m}</loc></sitemap>`).join('\n')}
</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
};
