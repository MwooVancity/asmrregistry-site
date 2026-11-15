import ledgerData from './asmr-keyword-ledger.json';

export interface LedgerKeyword {
  keyword: string;
  volume: number;
  kd: number;
}

export interface LedgerPage {
  slug: string;
  pageType: string;
  targetUrl: string;
  headKeyword: string;
  memberKeywords: LedgerKeyword[];
  totalDemand: number;
  headVolume: number;
  headKD: number;
  maxCPC: number;
  serpFeatures: string;
  category: string;
}

export interface Ledger {
  generatedAt: string;
  kdMax: number;
  source: string;
  stats: {
    totalKeywords: number;
    kdFiltered: number;
    nsfwFiltered: number;
    brandedFiltered: number;
    classifiedPages: number;
    skipped: number;
  };
  pages: LedgerPage[];
}

const ledger = ledgerData as Ledger;

export function loadLedger(): Ledger {
  return ledger;
}

export function getPagesByType(type: string): LedgerPage[] {
  return ledger.pages.filter(p => p.pageType === type);
}

export function getPageBySlug(slug: string): LedgerPage | undefined {
  return ledger.pages.find(p => p.slug === slug);
}

export function getPageByUrl(url: string): LedgerPage | undefined {
  return ledger.pages.find(p => p.targetUrl === url);
}

export function getRootPages(): LedgerPage[] {
  return ledger.pages.filter(p =>
    p.pageType === 'TRIGGER_HUB' ||
    p.pageType === 'INTENT_HUB' ||
    p.pageType === 'FORMAT_HUB' ||
    p.pageType === 'BEST_LIST' ||
    p.pageType === 'EQUIPMENT' ||
    p.pageType === 'INFO_GUIDE' ||
    p.pageType === 'GUIDE'
  );
}
