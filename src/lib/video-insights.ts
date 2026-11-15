// src/lib/video-insights.ts — per-video session guide (replaces shared trigger/intent prose)
// Each video's unique metadata combo (duration × intensity × format × triggers × intents)
// produces genuinely different bullets — no two pages share the same text block.

export interface SessionGuideInput {
  durationMin: number;
  intensity: number | null;
  format: string | null;
  primaryTrigger: string;
  triggers: string[];
  intents: string[];
}

export function deriveSessionGuide(input: SessionGuideInput): string[] {
  const { durationMin, intensity, format, primaryTrigger, triggers, intents } = input;
  const bullets: string[] = [];
  const intent = intents[0] || '';
  const trigger = primaryTrigger.replace(/-/g, ' ');

  // 1. Duration-calibrated advice — unique per video's actual length
  if (durationMin >= 480) {
    bullets.push(`${Math.floor(durationMin / 60)}-hour runtime — covers a full overnight sleep cycle. No gaps, no silence jolts at 3am.`);
  } else if (durationMin >= 240) {
    bullets.push(`${Math.floor(durationMin / 60)}-hour session — long enough for a full deep-sleep block or extended study marathon.`);
  } else if (durationMin >= 60) {
    const h = Math.floor(durationMin / 60);
    const m = durationMin % 60;
    const dur = m > 0 ? `${h}h ${m}m` : `${h} hour`;
    bullets.push(`${dur} runtime — enough for a complete wind-down and sleep onset without looping.`);
  } else if (durationMin >= 30) {
    bullets.push(`${durationMin}-minute session — fits a full relaxation block or one study focus cycle.`);
  } else if (durationMin > 0) {
    bullets.push(`${durationMin}-minute session — a quick sensory reset. Good between tasks or as a micro-break.`);
  }

  // 2. Intensity-calibrated advice — unique per video's rated intensity
  if (intensity !== null && intensity > 0) {
    if (intensity <= 2) {
      bullets.push(`Intensity ${intensity}/5 — rated gentle ${trigger} (an AI estimate from the title, not a listen). Likely fine for falling asleep or background listening; check the first minute.`);
    } else if (intensity === 3) {
      bullets.push(`Intensity ${intensity}/5 — moderate ${trigger} stimulation. Works for active tingle-seeking or relaxed focus, depending on your volume.`);
    } else {
      bullets.push(`Intensity ${intensity}/5 — strong ${trigger} stimulation. Best for active listening sessions when you want pronounced tingles, not background noise.`);
    }
  }

  // 3. Format-specific guidance — unique per video's format classification
  if (format === 'ambient') {
    bullets.push(`Ambient format — no voice, pure ${trigger} soundscape. Set volume just above the threshold where it masks room noise.`);
  } else if (format === 'roleplay') {
    bullets.push('Roleplay format — use stereo headphones for the full spatial positioning effect. The 3D audio breaks down on speakers.');
  } else if (format === 'compilation') {
    bullets.push('Compilation — multiple trigger segments in one session. Each shift in sound texture re-engages your attention without jarring transitions.');
  } else if (format === 'asmr-with-music') {
    bullets.push('ASMR layered with music — the melodic track fills gaps between trigger sounds. Keep volume moderate so the ASMR textures stay audible.');
  }

  // 4. Multi-trigger combination insight — unique per video's actual trigger set
  if (triggers.length > 1) {
    const others = triggers.filter(t => t !== primaryTrigger).slice(0, 2).map(t => t.replace(/-/g, ' '));
    if (others.length > 0) {
      bullets.push(`Layers ${trigger} with ${others.join(' and ')} — the combined textures create more auditory depth than single-trigger videos.`);
    }
  }

  // 5. Intent-specific practical advice — calibrated to THIS video's data, not generic
  if (intent === 'sleep') {
    if (durationMin >= 480) {
      bullets.push('Start at bedtime — this runs through the night. Volume low enough that you can\'t make out individual sounds from a pillow away.');
    } else if (durationMin >= 60) {
      bullets.push('Start 15–20 minutes before your target sleep time. Set a sleep timer if your device supports it.');
    } else {
      bullets.push('Too short for full-night use — good for a pre-sleep wind-down. Queue a longer session to follow.');
    }
  } else if (intent === 'study') {
    const vol = intensity !== null && intensity <= 2 ? 'barely audible' : 'low enough to ignore consciously';
    bullets.push(`For focus: keep volume ${vol}. If you catch yourself actively listening to the ${trigger} instead of working, lower it further.`);
  } else if (intent === 'tingles') {
    const tip = intensity !== null && intensity >= 4
      ? 'expect a strong tingle response — focus attention on the back of your scalp and neck'
      : 'tingles build gradually — give it 2–3 minutes before adjusting volume';
    bullets.push(`Use headphones for full detail. ${tip.charAt(0).toUpperCase() + tip.slice(1)}.`);
  } else if (intent === 'anxiety') {
    bullets.push('Breathe slowly while listening — sync your exhale to the rhythm of the sounds. The steady pattern gives your brain a concrete anchor.');
  } else if (intent === 'adhd') {
    bullets.push(`Keep volume fixed once set. The steady ${trigger} input gives the brain background stimulation that reduces the impulse to seek distraction.`);
  } else if (intent === 'insomnia') {
    bullets.push('Play at the same time each night to build a sleep association. Resist the urge to check the clock if you wake — the audio continues.');
  } else if (intent === 'meditation') {
    bullets.push(`Sit upright, not lying down. Use the ${trigger} sounds as your meditation object — when attention drifts, guide it back to the audio.`);
  } else if (intent === 'tinnitus') {
    bullets.push(`Adjust volume so the ${trigger} partially covers your tinnitus without overwhelming it. Partial masking trains the brain to deprioritize the signal.`);
  }

  return bullets;
}
