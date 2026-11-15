// src/lib/video-faqs.ts — data-derived per-video Q&As (evil-Google mandate 4).
// LAW LINE: every answer carries THIS video's / THIS trigger's real numbers
// (duration, intensity, live co-occurrence %, live counts) — distinct facts per
// page, never synonym-spun template prose. Rendered visibly AND schema'd.

export interface VideoFaqInput {
  triggerLabel: string;                              // 'tapping'
  intentLabels: string[];                            // ['sleep','tingles']
  durationMin: number;
  intensity: number | null;
  coOccurrence: { trigger: string; pct: number }[];  // from trigger_stats
  triggerVideoCount: number;                         // from trigger_stats
}

export interface Faq { q: string; a: string }

function humanDuration(min: number): string {
  if (min < 60) return `${min} minutes`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} hour${h > 1 ? 's' : ''} ${m} minutes` : `${h} hour${h > 1 ? 's' : ''}`;
}

export function deriveVideoFaqs(input: VideoFaqInput): Faq[] {
  const { triggerLabel, intentLabels, durationMin, intensity, coOccurrence, triggerVideoCount } = input;
  const faqs: Faq[] = [];
  const t = triggerLabel;

  // 1. Intent fit — names this video's intensity number
  if (intentLabels[0]) {
    const intent = intentLabels[0];
    const intensityPart = intensity
      ? ` This video rates ${intensity}/5 intensity — ${intensity <= 2 ? 'gentle enough for drifting off' : intensity === 3 ? 'moderate stimulation' : 'strong stimulation, better for active listening'}.`
      : '';
    faqs.push({
      q: `Is this ${t} ASMR good for ${intent}?`,
      a: `It's classified for ${intentLabels.join(' and ')}.${intensityPart}`,
    });
  }

  // 2. Duration — this video's real length
  if (durationMin > 0) {
    const use = durationMin >= 480 ? 'a full overnight session'
      : durationMin >= 60 ? 'a complete sleep wind-down or long study block'
      : durationMin >= 30 ? 'a full relaxation session'
      : 'a short focused break';
    faqs.push({
      q: `How long is this ${t} session?`,
      a: `${humanDuration(durationMin)} — enough for ${use}.`,
    });
  }

  // 3. Trigger pairing — live co-occurrence from the directory index
  if (coOccurrence.length > 0) {
    const pairs = coOccurrence.slice(0, 3)
      .map(c => `${c.pct}% also feature ${c.trigger.replace(/-/g, ' ')}`)
      .join(', ');
    faqs.push({
      q: `What triggers pair with ${t} ASMR?`,
      a: `Across ${triggerVideoCount > 0 ? `${triggerVideoCount} classified ${t} videos` : `our classified ${t} videos`}: ${pairs}.`,
    });
  }

  // 4. Registry depth — independent of pairing so duration-less videos still
  // clear the ≥3 visible-FAQ gate
  if (triggerVideoCount > 0) {
    faqs.push({
      q: `How many ${t} ASMR videos are classified here?`,
      a: `${triggerVideoCount} ${t} videos are currently classified in the registry, each tagged by intent, intensity, and duration.`,
    });
  }

  return faqs;
}
