export interface ValidationResult {
  pass: boolean;
  reason?: string;
  checks: Record<string, boolean>;
}

async function checkYouTubeURL(youtubeId: string): Promise<{ valid: boolean; duration: number }> {
  const maxRetries = 3;
  const backoff = [1000, 2000, 4000]; // 1s, 2s, 4s

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
      const response = await fetch(url);

      if (response.ok) {
        const data = await response.json();
        return {
          valid: true,
          duration: data.video_length || 0,
        };
      } else if (response.status === 404) {
        return { valid: false, duration: 0 };
      }

      // Temporary error, retry
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, backoff[attempt]));
        continue;
      }
    } catch (error) {
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, backoff[attempt]));
        continue;
      }
      return { valid: false, duration: 0 };
    }
  }

  return { valid: false, duration: 0 };
}

export async function validateMetadataQuality(video: any): Promise<ValidationResult> {
  const checks: Record<string, boolean> = {};
  const reasons: string[] = [];

  // Check 1: Duration
  const durationMin = 20 * 60; // 20 minutes in seconds
  const durationMax = 120 * 60; // 120 minutes in seconds
  checks.duration = video.duration_seconds >= durationMin && video.duration_seconds <= durationMax;
  if (!checks.duration) reasons.push(`Duration ${video.duration_seconds}s outside 20–120 min range`);

  // Check 2: Trigger tags
  checks.triggers = Array.isArray(video.triggers) && video.triggers.length > 0;
  if (!checks.triggers) reasons.push('No trigger tags assigned');

  // Check 3: Intent mapping
  checks.intents = Array.isArray(video.intents) && video.intents.length > 0;
  if (!checks.intents) reasons.push('No intent mapping');

  // Check 4: Intensity rating
  checks.intensity = video.intensity >= 1 && video.intensity <= 5;
  if (!checks.intensity) reasons.push('Intensity outside 1–5 range');

  // Check 5: Creator exists
  checks.creator = !!video.creator_id;
  if (!checks.creator) reasons.push('No creator_id assigned');

  // Check 6: YouTube URL validity (with retry logic)
  const ytCheck = await checkYouTubeURL(video.youtube_id);
  checks.youtube_url = ytCheck.valid;
  if (!checks.youtube_url) reasons.push(`YouTube video ${video.youtube_id} not found or inaccessible`);

  const pass = Object.values(checks).every(v => v === true);

  return {
    pass,
    reason: reasons.join('; '),
    checks,
  };
}
