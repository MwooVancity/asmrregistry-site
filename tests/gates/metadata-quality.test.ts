import { describe, it, expect } from 'vitest';
import { validateMetadataQuality } from '../../src/lib/gates/metadata-quality';

describe('Metadata Quality Gate', () => {
  it('should PASS with complete, valid metadata', async () => {
    const video = {
      youtube_id: 'dQw4w9WgXcQ',
      duration_seconds: 3600,
      triggers: ['rain', 'thunderstorm'],
      intents: ['sleep'],
      intensity: 3,
      creator_id: 'creator-1',
    };
    const result = await validateMetadataQuality(video);
    expect(result.pass).toBe(true);
  });

  it('should FAIL if duration is outside 20–120 minutes', async () => {
    const video = {
      youtube_id: 'dQw4w9WgXcQ',
      duration_seconds: 600, // 10 minutes, too short
      triggers: ['rain'],
      intents: ['sleep'],
      intensity: 3,
      creator_id: 'creator-1',
    };
    const result = await validateMetadataQuality(video);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('Duration');
  });

  it('should FAIL if no trigger tags present', async () => {
    const video = {
      youtube_id: 'dQw4w9WgXcQ',
      duration_seconds: 3600,
      triggers: [],
      intents: ['sleep'],
      intensity: 3,
      creator_id: 'creator-1',
    };
    const result = await validateMetadataQuality(video);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('No trigger');
  });

  it('should FAIL if no intent mapping present', async () => {
    const video = {
      youtube_id: 'dQw4w9WgXcQ',
      duration_seconds: 3600,
      triggers: ['rain'],
      intents: [],
      intensity: 3,
      creator_id: 'creator-1',
    };
    const result = await validateMetadataQuality(video);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('No intent');
  });

  it('should FAIL if YouTube video does not exist', async () => {
    const video = {
      youtube_id: 'NONEXISTENT00000',
      duration_seconds: 3600,
      triggers: ['rain'],
      intents: ['sleep'],
      intensity: 3,
      creator_id: 'creator-1',
    };
    const result = await validateMetadataQuality(video);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('YouTube');
  });
});
