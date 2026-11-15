export interface PillarMeta {
  slug: string;
  publishDate: string;
  youtubeQuery: string;
  dbQuery: PillarDbQuery;
  cluster: 'authority' | 'intent' | 'trigger' | 'niche';
}

export type PillarDbQuery =
  | { type: 'intent';    intent: string }
  | { type: 'trigger';   trigger: string }
  | { type: 'triggers';  triggers: string[] }
  | { type: 'format';    format: string }
  | { type: 'duration';  buckets: string[] }
  | { type: 'top';       limit: number }
  | { type: 'language';  language: string };

export const PILLAR_SCHEDULE: PillarMeta[] = [];

export const PILLAR_MAP = new Map<string, PillarMeta>();

export function isPillarLive(_slug: string): boolean {
  return false;
}

export function getTodaysPillars(): PillarMeta[] {
  return [];
}

export function getTodaysPillar(): PillarMeta | null {
  return null;
}
