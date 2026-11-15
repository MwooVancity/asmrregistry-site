// No-JavaScript fallback for Amazon links. Deliberately NOT a redirect (see src/lib/amazon.ts): a person must
// click a plainly labelled Amazon link, and a bot fetching this page does not reach Amazon.
export const prerender = false;
import type { APIRoute } from 'astro';
import { amazonDirect, amazonProductDirect } from '../../lib/amazon';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const GET: APIRoute = ({ url }) => {
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  if (!q) return new Response(null, { status: 404 });
  const asin = url.searchParams.get('asin') || '';
  const dest = /^[A-Z0-9]{10}$/.test(asin) ? amazonProductDirect(asin) : amazonDirect(q, url.searchParams.has('best'));
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Open Amazon search</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">
<p><a rel="sponsored nofollow noopener" href="${esc(dest)}">View ${esc(q)} on Amazon</a></p>
<p><small>Paid link: as an Amazon Associate, ASMR Registry earns from qualifying purchases.</small></p>
</body></html>`;
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'public, max-age=86400' } });
};
