export interface CreatorAuthorityResult {
  pass: boolean;
  reason?: string;
  authority_score: number; // 0–100
}

export interface Creator {
  id: string;
  channel_id: string;
  name: string;
  subscriber_count: number;
  video_count: number;
  channel_age_days: number;
  verified: boolean;
  flagged_as_spam: boolean;
}

export function calculateAuthorityScore(creator: Creator): number {
  let score = 0;

  // Subscriber count (weight 30%, min 1K = 10 pts, max 1M = 30 pts)
  const subScore = Math.min(30, (Math.log10(Math.max(1000, creator.subscriber_count)) - 3) / 3 * 30);
  score += subScore;

  // Video count (weight 25%, min 10 = 5 pts, max 1000 = 25 pts)
  const vidScore = Math.min(25, (Math.log10(Math.max(10, creator.video_count)) - 1) / 3 * 25);
  score += vidScore;

  // Channel age (weight 15%, min 30 days = 0 pts, max 10 years = 15 pts)
  const ageScore = Math.min(15, (Math.max(0, creator.channel_age_days - 30) / 3650) * 15);
  score += ageScore;

  // Verification bonus (weight 10%)
  const verifyScore = creator.verified ? 10 : 0;
  score += verifyScore;

  return Math.round(Math.min(100, score));
}

export function validateCreatorAuthority(creator: Creator): CreatorAuthorityResult {
  const authority_score = calculateAuthorityScore(creator);

  // Hard block 1: <10 videos and not verified
  if (creator.video_count < 10 && !creator.verified) {
    return {
      pass: false,
      reason: 'Creator has <10 videos and is not verified',
      authority_score,
    };
  }

  // Hard block 2: Channel <30 days old
  if (creator.channel_age_days < 30) {
    return {
      pass: false,
      reason: 'Creator channel <30 days old (spam prevention)',
      authority_score,
    };
  }

  // Hard block 3: Flagged as spam
  if (creator.flagged_as_spam) {
    return {
      pass: false,
      reason: 'Creator flagged as spam',
      authority_score,
    };
  }

  return {
    pass: true,
    authority_score,
  };
}
