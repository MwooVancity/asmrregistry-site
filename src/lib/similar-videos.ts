// Similar videos come from the build-time hub snapshot (top videos per trigger), so a video page
// view costs zero extra D1 reads. The previous per-request join over trigger_usecase_pairs scanned
// ~77k rows per call and exhausted the D1 free tier (100M+ reads/day) from crawler traffic.
import HUB_DATA from './hub-data-all.json';

export function getSimilarVideos(trigger: string, excludeId: string, n = 6): any[] {
  const vids: any[] = (HUB_DATA as any).triggerHubs?.[trigger]?.videos ?? [];
  return vids.filter(v => v.id !== excludeId).slice(0, n);
}
