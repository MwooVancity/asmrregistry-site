import { describe, it, expect } from 'vitest';
import { checkIndexFreshness } from '../../src/lib/gates/search-index-freshness';

describe('Search Index Freshness Gate', () => {
  it('should PASS if ingest latency <2 hours', async () => {
    const lastIngest = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
    const result = await checkIndexFreshness(lastIngest);
    expect(result.pass).toBe(true);
    expect(result.latency_seconds).toBeLessThan(7200);
  });

  it('should FAIL if ingest latency >6 hours', async () => {
    const lastIngest = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7 hours ago
    const result = await checkIndexFreshness(lastIngest);
    expect(result.pass).toBe(false);
  });

  it('should detect index consistency drift >5%', async () => {
    const result = await checkIndexFreshness(new Date());
    expect(result.consistency_drift_pct).toBeLessThan(5);
  });
});
