import { describe, it, expect } from 'vitest';
import { detectDuplicates } from '../../src/lib/gates/deduplication';

describe('Deduplication Gate', () => {
  it('should return empty array if no duplicates', async () => {
    const video = {
      youtube_id: 'video1',
      title: 'Rain ASMR 1 Hour',
      audio_fingerprint: 'fingerprint1',
    };
    const existing = [
      { youtube_id: 'video2', title: 'Thunderstorm ASMR', audio_fingerprint: 'fingerprint2' },
    ];
    const dups = await detectDuplicates(video, existing);
    expect(dups).toEqual([]);
  });

  it('should detect exact audio fingerprint match', async () => {
    const video = {
      youtube_id: 'video1_reupload',
      title: 'Rain ASMR 1 Hour',
      audio_fingerprint: 'fingerprint1',
    };
    const existing = [
      { youtube_id: 'video1_original', title: 'Rain ASMR 1 Hour', audio_fingerprint: 'fingerprint1' },
    ];
    const dups = await detectDuplicates(video, existing);
    expect(dups.length).toBe(1);
    expect(dups[0].canonical_video_id).toBe('video1_original');
  });

  it('should detect title similarity >95%', async () => {
    const video = {
      youtube_id: 'video2',
      title: 'Rain ASMR Sleep 1 Hour',
      audio_fingerprint: 'fingerprint2',
    };
    const existing = [
      { youtube_id: 'video1', title: 'Rain ASMR Sleep 1 Hour', audio_fingerprint: 'fingerprint3' },
    ];
    const dups = await detectDuplicates(video, existing);
    expect(dups.length).toBe(1);
    expect(dups[0].reason).toContain('title');
  });
});
