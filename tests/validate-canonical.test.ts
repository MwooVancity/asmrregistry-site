import { describe, it, expect } from 'vitest';
import { validateCanonicalConsistency } from '../tools/validate-canonical-consistency';

describe('Canonical Consistency Gate', () => {
  it('should PASS if all videos are canonical to /video/[id]', async () => {
    const pages = [
      { slug: 'video/dQw4w9WgXcQ', canonical_url: '/video/dQw4w9WgXcQ' },
      { slug: 'video/abc123def456', canonical_url: '/video/abc123def456' },
    ];
    const result = validateCanonicalConsistency(pages);
    expect(result.pass).toBe(true);
  });

  it('should FAIL if hub page claims to be canonical', async () => {
    const pages = [
      { slug: 'search', canonical_url: '/search?intent=sleep&trigger=rain' },
    ];
    const result = validateCanonicalConsistency(pages);
    expect(result.pass).toBe(false);
  });

  it('should FAIL if same video appears in two different hubs', async () => {
    const pages = [
      { slug: 'video/abc123', canonical_url: '/video/abc123', canonical_silo: 'intent' },
      { slug: 'video/abc123', canonical_url: '/video/abc123', canonical_silo: 'trigger' },
    ];
    const result = validateCanonicalConsistency(pages);
    expect(result.pass).toBe(false);
  });
});
