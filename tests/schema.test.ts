import { describe, it, expect, beforeAll } from 'vitest';
import { initSchema, getDb } from '../src/lib/db';

describe('Database Schema', () => {
  beforeAll(async () => {
    await initSchema();
  });

  it('should create all tables on init', async () => {
    const result = await initSchema();
    expect(result).toHaveProperty('videos');
    expect(result).toHaveProperty('creators');
    expect(result).toHaveProperty('hubs');
    expect(result).toHaveProperty('pillars');
  });

  it('should verify tables exist with correct columns', async () => {
    const db = getDb();

    // Verify videos table exists and has primary_trigger column
    const videosInfo = await db.execute('PRAGMA table_info(videos)');
    expect(videosInfo.rows).toBeDefined();
    const videoColumns = (videosInfo.rows || []).map((row: any) => row.name || row[1]);
    expect(videoColumns.length).toBeGreaterThan(0);
    expect(videoColumns).toContain('id');
    expect(videoColumns).toContain('primary_trigger');
    expect(videoColumns).toContain('intensity');

    // Verify creators table exists
    const creatorsInfo = await db.execute('PRAGMA table_info(creators)');
    expect(creatorsInfo.rows).toBeDefined();
    const creatorColumns = (creatorsInfo.rows || []).map((row: any) => row.name || row[1]);
    expect(creatorColumns.length).toBeGreaterThan(0);
    expect(creatorColumns).toContain('id');
    expect(creatorColumns).toContain('channel_id');

    // Verify hubs table exists
    const hubsInfo = await db.execute('PRAGMA table_info(hubs)');
    expect(hubsInfo.rows).toBeDefined();
    const hubColumns = (hubsInfo.rows || []).map((row: any) => row.name || row[1]);
    expect(hubColumns.length).toBeGreaterThan(0);
    expect(hubColumns).toContain('id');
    expect(hubColumns).toContain('intent');

    // Verify pillars table exists
    const pillarsInfo = await db.execute('PRAGMA table_info(pillars)');
    expect(pillarsInfo.rows).toBeDefined();
    const pillarColumns = (pillarsInfo.rows || []).map((row: any) => row.name || row[1]);
    expect(pillarColumns.length).toBeGreaterThan(0);
    expect(pillarColumns).toContain('id');
    expect(pillarColumns).toContain('slug');
  });

  it('should verify FTS index exists', async () => {
    const db = getDb();

    // Verify videos_fts virtual table exists
    const ftsInfo = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='videos_fts'");
    expect(ftsInfo.rows).toBeDefined();
    expect(ftsInfo.rows?.length).toBeGreaterThan(0);
  });
});
