// src/middleware.ts
declare const __BUILD_ID__: string; // set in astro.config.mjs
import { defineMiddleware } from 'astro:middleware';
import { getDb } from './lib/db';
// @ts-ignore — resolved only in CF Workers runtime
import { env as cfEnv } from 'cloudflare:workers';

// Old slugs that were renamed/removed — 301 to their canonical replacement
const SLUG_REDIRECTS: Record<string, string> = {
  '/whispering-asmr/': '/whispering/',
  '/rain-asmr/': '/rain/',
  '/roleplay-asmr/': '/personal-attention/',
  '/best-asmr-for-sleep/': '/sleep/',
  '/best-asmr-creators/': '/creators/',
  '/asmr-triggers/': '/triggers/',
  '/best-asmr-videos/': '/',
  '/search/': '/asmr-videos/', // the old search scanned the whole videos table per request; the finder reads a static file
};

// Valid top-level intent/trigger slugs that exist as pages
const VALID_ROOT_SLUGS = new Set([
  'sleep','study','relax','background','tingles','anxiety','adhd','meditation',
  'headache','tinnitus','depression','kids','insomnia',
  'tapping','scratching','whispering','soft-speaking','typing','crinkling',
  'page-turning','brushing','hair-play','eating-sounds','mouth-sounds','kisses',
  'rain','ocean','fire','nature','writing','cooking','soap-carving','sand','slime',
  'water-sounds','massage','breathing','reading','painting','clicking','spraying',
  'folding','glass-sounds','binaural','white-noise','no-talking',
  'positive-affirmations','counting','personal-attention','light-patterns',
]);

export const onRequest = defineMiddleware(async (context, next) => {
  // Initialize D1 — Astro v6: bindings via cloudflare:workers env module
  const db = cfEnv?.DB ?? (context.locals as any).runtime?.env?.DB;
  if (db) getDb(db);

  const url = new URL(context.request.url);
  let path = url.pathname;
  let redirect = false;

  // 1. Trailing slash enforcement (except files with extensions)
  if (!path.endsWith('/') && !path.includes('.')) {
    path = path + '/';
    redirect = true;
  }

  // 2. Lowercase enforcement (skip /video/ — YouTube IDs are case-sensitive)
  if (!path.startsWith('/video/') && !/^\/creators\/[^/]+\/v\//.test(path)) { // YouTube IDs are case-sensitive
    const lower = path.toLowerCase();
    if (path !== lower) {
      path = lower;
      redirect = true;
    }
  }

  if (redirect) {
    return context.redirect(path, 301);
  }

  // 3. Hard-coded slug redirects (renamed/removed pages)
  if (SLUG_REDIRECTS[path]) {
    return context.redirect(SLUG_REDIRECTS[path], 301);
  }

  // 4. Intent/trigger combo routes that don't exist as pages → redirect to parent intent
  //    Pattern: /sleep/rain/ /study/counting/ /anxiety/binaural/ etc.
  const comboMatch = path.match(/^\/([a-z-]+)\/([a-z-]+)\/$/);
  if (comboMatch) {
    const [, parent, child] = comboMatch;
    // Only redirect if parent is a valid root slug and this isn't a real sub-route
    // Real sub-routes: /video/, /creators/, /best/, /gear/, /guides/, /tools/, /admin/, /author/
    const REAL_PARENTS = new Set(['video','creators','best','gear','guides','tools','admin','author','page']);
    if (!REAL_PARENTS.has(parent) && VALID_ROOT_SLUGS.has(parent)) {
      // Check DB — if this combo has videos, let it through; otherwise redirect to parent
      try {
        const dbConn = getDb();
        const slug = `${parent}/${child}`;
        const result = await dbConn.execute({
          sql: `SELECT video_count FROM active_pages WHERE slug = ? AND video_count > 0`,
          args: [slug],
        });
        if (result.rows.length === 0) {
          return context.redirect(`/${parent}/`, 301);
        }
      } catch {
        // DB unavailable — let the page handle it
      }
    }
  }

  // 5. Dead hub check — zero-video combo pages redirect to parent
  if (path.match(/^\/[a-z]+\/[a-z-]+\/$/)) {
    try {
      const dbConn = getDb();
      const slug = path.slice(1, -1);
      const result = await dbConn.execute({
        sql: `SELECT video_count FROM active_pages WHERE slug = ? AND video_count = 0`,
        args: [slug],
      });
      if (result.rows.length > 0) {
        const parent = '/' + slug.split('/').slice(0, -1).join('/') + '/';
        return context.redirect(parent, 301);
      }
    } catch {
      // DB not available
    }
  }

  // Video pages are noindexed and heavily bot-crawled. Cache the rendered HTML at the edge for 24h so repeat
  // views cost zero D1 reads and survive a D1 outage. Cache API is a no-op on *.workers.dev; works on the custom domain.
  const isVideoPage = context.request.method === 'GET' && /^\/video\/[A-Za-z0-9_-]{6,20}\/$/.test(path);
  // Creator pages run 3 D1 queries per view (big channels read ~1,000 rows); cache 6h so bio edits still land same day.
  const isCreatorPage = context.request.method === 'GET' && /^\/creators\/[a-z0-9-]+\/$/.test(path);
  const edgeTtl = isCreatorPage ? 21600 : 86400;
  const edge: any = (isVideoPage || isCreatorPage) && typeof caches !== 'undefined' ? (caches as any).default : null;
  // Key on the path only: ?utm/bot params must not create copies or skip the cache.
  // The build stamp retires old copies on deploy, so cached HTML never points at deleted CSS.
  const cacheKey = `${new URL(context.request.url).origin}${path}?build=${__BUILD_ID__}`;
  if (edge) {
    try {
      const hit = await edge.match(cacheKey);
      if (hit) {
        const out = new Response(hit.body, hit);
        out.headers.set('x-edge-cache', 'HIT');
        return out;
      }
    } catch { /* cache unavailable: fall through to render */ }
  }

  const response = await next();

  if (edge && response.status === 200) {
    try {
      const copy = new Response(response.clone().body, response);
      copy.headers.set('Cache-Control', `public, max-age=${edgeTtl}`);
      const put = edge.put(cacheKey, copy);
      const cf = (context.locals as any).cfContext;
      if (cf?.waitUntil) cf.waitUntil(put.catch(() => {})); else await put; // don't hold the response for the write
    } catch { /* never fail a request because caching failed */ }
  }

  // 6. 404 safety net — Googlebot must never receive a 404.
  //    Any route that couldn't serve content redirects to home.
  //    Exceptions: ADSENSE_BLOCKED slugs stay 410 (permanent gone signal).
  //    Exceptions: /api/ endpoints, /video/ pages (noindexed, Googlebot disallowed).
  if (response.status === 404) {
    const isApi = path.startsWith('/api/');
    const isVideo = path.startsWith('/video/');
    if (!isApi && !isVideo) {
      // Pagination pages: redirect to hub (/slug/page/N/ → /slug/)
      const pageMatch = path.match(/^(\/[^/]+\/)page\/\d+\/$/);
      if (pageMatch) return context.redirect(pageMatch[1], 301);
      // Creator pages we removed (health-claim channels, channels under 15 videos): gone, not a soft 404 to home.
      if (/^\/creators\/[a-z0-9-]+\/$/.test(path)) return new Response(null, { status: 410 });
      // Everything else: redirect to home
      return context.redirect('/', 301);
    }
  }

  return response;
});
