export interface CanonicalValidationResult {
  pass: boolean;
  violations: Array<{ page: string; reason: string }>;
}

export function validateCanonicalConsistency(pages: any[]): CanonicalValidationResult {
  const violations: Array<{ page: string; reason: string }> = [];
  const videoCanonicals = new Map<string, string>();

  // Rule 1: Hub pages should NOT be canonical
  for (const page of pages) {
    if (page.slug.includes('search') || page.slug.includes('hub')) {
      if (page.canonical_url?.includes('search') || page.canonical_url?.includes('hub')) {
        violations.push({
          page: page.slug,
          reason: 'Hub page claims to be canonical (only detail pages are canonical)',
        });
      }
    }
  }

  // Rule 2: No dual-silo canonicalization (same video in two different hubs)
  for (const page of pages) {
    if (page.slug.startsWith('video/')) {
      const videoId = page.slug.replace('video/', '');
      const silo = page.canonical_silo || 'intent';

      if (videoCanonicals.has(videoId)) {
        const prevSilo = videoCanonicals.get(videoId);
        if (prevSilo !== silo) {
          violations.push({
            page: page.slug,
            reason: `Video appears in both ${prevSilo} and ${silo} silos`,
          });
        }
      }
      videoCanonicals.set(videoId, silo);
    }
  }

  // Rule 3: All detail pages must be /video/[id] not other paths
  for (const page of pages) {
    if (page.slug.startsWith('video/') && !page.canonical_url?.startsWith('/video/')) {
      violations.push({
        page: page.slug,
        reason: 'Video canonical URL should be /video/[youtube-id], not ' + page.canonical_url,
      });
    }
  }

  return {
    pass: violations.length === 0,
    violations,
  };
}
