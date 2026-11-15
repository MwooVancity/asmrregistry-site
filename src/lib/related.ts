// Site-wide "related pages" plan, computed once per Worker start. Pages link within their group (guides with
// best-of and gear; triggers with formats; intents with intents) by shared search words. No page is suggested more
// than its cap (6, or 30 for high-demand pages), so the same popular pages cannot take every slot and small pages get linked.
import ledgerData from './asmr-keyword-ledger.json';
import { hrefFor, getContent } from './page-content';
import { SUGGESTIVE } from '../../scripts/lib/creator-gate-lib.mjs';

const GROUPS = [['GUIDE', 'INFO_GUIDE', 'BEST_LIST', 'EQUIPMENT'], ['TRIGGER_HUB', 'FORMAT_HUB'], ['INTENT_HUB']];
const STOP = new Set(['asmr', 'for', 'the', 'and', 'what', 'how', 'best', 'with', 'you', 'your', 'why', 'does', 'sounds', 'sound', 'video', 'videos', 'youtube', 'free', 'online']);
const MAX_OUT = 5;
// Winnable = sum of volume / (kd + 1), ignoring searches a video site cannot answer (local, prices, Patreon).
const LOCAL = /near me|\bnyc\b|price|patreon|queens/i;
const winnable = (p: any) => (p.memberKeywords || []).reduce((s: number, k: any) => s + (LOCAL.test(k.keyword) ? 0 : k.volume / ((k.kd || 0) + 1)), 0);
const W: Record<string, number> = {};
for (const p of (ledgerData as any).pages) W[p.slug] = winnable(p);
const capOf = (slug: string) => (W[slug] >= 1000 ? 30 : 6);

const words = (p: any) => new Set<string>([p.headKeyword, ...(p.memberKeywords || []).slice(0, 8).map((k: any) => k.keyword)]
  .join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));

const plan: Record<string, string[]> = {};
for (const types of GROUPS) {
  // 'kisses' is never pushed from other pages (content safety: it sits next to suggestive content on YouTube).
  const pages = (ledgerData as any).pages.filter((p: any) => types.includes(p.pageType) && !['triggers-overview', 'kisses'].includes(p.slug) && hrefFor(p.slug));
  const w = new Map(pages.map((p: any) => [p.slug, words(p)]));
  const inCount: Record<string, number> = {};
  // Smallest pages pick first, so they are not left with nothing after big pages fill their slots.
  for (const p of [...pages].sort((a: any, b: any) => (a.totalDemand || 0) - (b.totalDemand || 0))) {
    const mine = w.get(p.slug) as Set<string>;
    plan[p.slug] = pages.filter((o: any) => o.slug !== p.slug)
      .map((o: any) => { let s = 0; for (const x of w.get(o.slug) as Set<string>) if (mine.has(x)) s++; return [o.slug, s] as [string, number]; })
      .filter(([, s]) => s > 0)
      .sort((a, b) => b[1] - a[1] || W[b[0]] - W[a[0]])
      .filter(([o]) => (inCount[o] || 0) < capOf(o)).slice(0, MAX_OUT)
      .map(([o]) => { inCount[o] = (inCount[o] || 0) + 1; return o; });
  }
  // Second pass: pages with no shared words (e.g. "velcro sounds") would get no links at all, so fill empty slots
  // with the least-linked pages of the same type. Those are browsing suggestions, not claims of similarity.
  for (const p of pages) {
    const have = plan[p.slug];
    for (const o of pages.filter((o: any) => o.slug !== p.slug && o.pageType === p.pageType && !have.includes(o.slug))
      .sort((a: any, b: any) => (inCount[a.slug] || 0) - (inCount[b.slug] || 0))) {
      if (have.length >= MAX_OUT) break;
      if ((inCount[o.slug] || 0) >= capOf(o.slug)) continue;
      have.push(o.slug); inCount[o.slug] = (inCount[o.slug] || 0) + 1;
    }
  }
}

export const relatedFor = (slug: string): string[] => plan[slug] || [];

// Monthly searches for a creator by name, from the keyword ledger (slug written either way round, e.g. asmr-gibi and
// gibi-asmr). Built once per Worker start; hub pages rank their creator links by it.
const VOL: Record<string, number> = {};
for (const p of (ledgerData as any).pages) VOL[p.slug] = (p.memberKeywords || []).reduce((s: number, k: any) => s + (k.volume || 0), 0);
export const creatorDemand = (slug: string) =>
  Math.max(VOL[slug] ?? 0, VOL[slug.replace(/^asmr-(.*)$/, '$1-asmr')] ?? 0, VOL[slug.replace(/^(.*)-asmr$/, 'asmr-$1')] ?? 0);

// Footer: the most winnable pages per type, so the links on every page point where search demand is.
// massage and kisses are never placed site-wide (their searches sit next to suggestive content).
const NEVER = new Set(['kisses', 'massage', 'sleep', 'triggers-overview']);
// Cached per Worker start: the ledger and page content do not change between deploys.
const footerCache = new Map<string, { href: string; label: string }[]>();
export const footerPicks = (types: string[], n: number) => {
  const key = types.join() + n;
  if (!footerCache.has(key)) footerCache.set(key, pickFooter(types, n));
  return footerCache.get(key)!;
};
const pickFooter = (types: string[], n: number) => (ledgerData as any).pages
  .filter((p: any) => types.includes(p.pageType) && !NEVER.has(p.slug) && !SUGGESTIVE.test(p.headKeyword) && hrefFor(p.slug))
  .sort((a: any, b: any) => W[b.slug] - W[a.slug]).slice(0, n)
  .map((p: any) => ({ href: hrefFor(p.slug) as string, label: (getContent(p.slug)?.h1 || p.headKeyword).replace(/\?.*$/, '?').replace(/\s+[-–—]\s.*$|\s*[:(].*$/, '') }));
