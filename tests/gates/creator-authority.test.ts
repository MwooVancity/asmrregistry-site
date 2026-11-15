import { describe, it, expect } from 'vitest';
import { validateCreatorAuthority } from '../../src/lib/gates/creator-authority';

describe('Creator Authority Gate', () => {
  it('should PASS for creator with ≥10 videos and ≥1K subscribers', () => {
    const creator = {
      id: 'creator-1',
      channel_id: 'UC_xyz',
      name: 'Rain ASMR Master',
      subscriber_count: 100000,
      video_count: 50,
      channel_age_days: 365,
      verified: false,
      flagged_as_spam: false,
    };
    const result = validateCreatorAuthority(creator);
    expect(result.pass).toBe(true);
  });

  it('should FAIL for creator with <10 videos and not verified', () => {
    const creator = {
      id: 'creator-2',
      channel_id: 'UC_abc',
      name: 'New Creator',
      subscriber_count: 5000,
      video_count: 5,
      channel_age_days: 30,
      verified: false,
      flagged_as_spam: false,
    };
    const result = validateCreatorAuthority(creator);
    expect(result.pass).toBe(false);
  });

  it('should FAIL for creator with <30 day old channel', () => {
    const creator = {
      id: 'creator-3',
      channel_id: 'UC_def',
      name: 'Bot Account',
      subscriber_count: 10000,
      video_count: 100,
      channel_age_days: 5,
      verified: false,
      flagged_as_spam: false,
    };
    const result = validateCreatorAuthority(creator);
    expect(result.pass).toBe(false);
  });

  it('should PASS if verified even with <10 videos', () => {
    const creator = {
      id: 'creator-4',
      channel_id: 'UC_ghi',
      name: 'Verified Expert',
      subscriber_count: 500,
      video_count: 3,
      channel_age_days: 180,
      verified: true,
      flagged_as_spam: false,
    };
    const result = validateCreatorAuthority(creator);
    expect(result.pass).toBe(true);
  });
});
