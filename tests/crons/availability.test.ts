import { describe, it, expect } from 'vitest';
import { detectStaleVideos } from '../../tools/video-availability-cron';

describe('Video Availability Cron', () => {
  it('should return stale videos array', async () => {
    const stale = await detectStaleVideos();
    expect(Array.isArray(stale)).toBe(true);
  });

  it('should have video properties', async () => {
    const stale = await detectStaleVideos();
    if (stale.length > 0) {
      expect(stale[0]).toHaveProperty('id');
      expect(stale[0]).toHaveProperty('youtube_id');
      expect(stale[0]).toHaveProperty('reason');
    }
  });

  it('should detect by reason', async () => {
    const stale = await detectStaleVideos();
    stale.forEach((s: any) => {
      expect(['deleted', 'duration_changed', 'inactive_creator']).toContain(s.reason);
    });
  });
});
