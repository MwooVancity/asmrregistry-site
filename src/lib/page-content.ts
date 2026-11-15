import contentData from './asmr-page-content.json';

export interface CrossLink {
  label: string;
  href: string;
}

export interface Reference {
  label: string;
  url: string;
}

export interface PageContent {
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  introHtml: string;
  faqItems: { question: string; answer: string; shortAnswer?: string }[];
  proTips: string[];
  crossLinks?: CrossLink[];
  references?: Reference[];
  lastUpdated: string;
  status: 'draft' | 'published';
}

export type PageContentStore = Record<string, PageContent>;

const store = contentData as PageContentStore;

import { getPageBySlug } from './ledger';

// Canonical link for a slug: the ledger targetUrl if the page is published, else null (never link a redirect or 404).
export function hrefFor(slug: string): string | null {
  const page = getPageBySlug(slug);
  return page && store[slug]?.status === 'published' ? page.targetUrl : null;
}

// A link to a merged (redirected) page, rewritten to where it redirects, so no in-content link goes through a 301.
const MOVED: Record<string, string> = {};
for (const [s, v] of Object.entries(store as Record<string, any>)) {
  const url = v?.status === 'redirected' && v.redirectTo && getPageBySlug(s)?.targetUrl;
  if (url) MOVED[url] = v.redirectTo;
}
export const liveHref = (href: string): string => MOVED[href] ?? href;

export function getContent(slug: string): PageContent | undefined {
  return store[slug];
}
