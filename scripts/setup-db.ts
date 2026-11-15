// scripts/setup-db.ts
import { getDb } from './lib/db';

const db = getDb();

async function setup() {
  // 1. ingest_queue
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ingest_queue (
      id TEXT PRIMARY KEY,
      raw_title TEXT,
      raw_channel_id TEXT,
      raw_channel_name TEXT,
      raw_duration_seconds INTEGER,
      raw_view_count INTEGER,
      raw_publish_date TEXT,
      raw_description TEXT,
      processing_status TEXT DEFAULT 'pending',
      failure_reason TEXT,
      gemini_response TEXT,
      retry_count INTEGER DEFAULT 0,
      queued_at TEXT,
      processed_at TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_ingest_queue_retry ON ingest_queue(processing_status, retry_count, processed_at)`);
  // Fresh uploads first (cron enrich-batch, tools/backfill-enrich.ts) without scanning the whole queue.
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_queue_status_pub ON ingest_queue(processing_status, raw_publish_date)`);

  // 2. videos
  await db.execute(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT,
      duration_seconds INTEGER,
      publish_date TEXT,
      view_count INTEGER DEFAULT 0,
      primary_trigger TEXT,
      triggers TEXT,
      intents TEXT,
      intensity INTEGER,
      language TEXT,
      format TEXT,
      modifiers TEXT,
      duration_bucket TEXT,
      roleplay_scenario TEXT,
      confidence REAL,
      is_asmr BOOLEAN,
      status TEXT DEFAULT 'draft',
      last_synchronized TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_videos_primary_trigger ON videos(primary_trigger)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_videos_language ON videos(language)`);

  // 3. channels
  await db.execute(`
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT,
      slug TEXT UNIQUE,
      video_count INTEGER DEFAULT 0,
      avg_intensity REAL,
      top_triggers TEXT,
      last_updated TEXT,
      status TEXT DEFAULT 'active'
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_channels_slug ON channels(slug)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_channels_status ON channels(status)`);

  // 4. active_pages
  await db.execute(`
    CREATE TABLE IF NOT EXISTS active_pages (
      slug TEXT PRIMARY KEY,
      page_type TEXT NOT NULL,
      publish_phase INTEGER DEFAULT 0,
      sitemap_eligible BOOLEAN DEFAULT FALSE,
      video_count INTEGER DEFAULT 0,
      editorial_angle TEXT,
      search_volume_tier TEXT,
      last_updated TEXT
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_active_pages_type ON active_pages(page_type)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_active_pages_eligible ON active_pages(sitemap_eligible)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_active_pages_updated ON active_pages(last_updated)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_active_pages_sitemap ON active_pages(sitemap_eligible, last_updated)`);

  // 5. trigger_usecase_pairs
  await db.execute(`
    CREATE TABLE IF NOT EXISTS trigger_usecase_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id TEXT NOT NULL,
      trigger_slug TEXT NOT NULL,
      intent_slug TEXT NOT NULL,
      FOREIGN KEY (video_id) REFERENCES videos(id)
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tup_video ON trigger_usecase_pairs(video_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tup_trigger ON trigger_usecase_pairs(trigger_slug)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tup_intent ON trigger_usecase_pairs(intent_slug)`);

  // 6. hub_intelligence
  await db.execute(`
    CREATE TABLE IF NOT EXISTS hub_intelligence (
      hub_slug TEXT PRIMARY KEY,
      hub_type TEXT,
      video_count INTEGER,
      avg_intensity REAL,
      long_format_pct REAL,
      no_talking_pct REAL,
      binaural_pct REAL,
      duration_distribution TEXT,
      top_creators TEXT,
      computed_at TEXT
    )
  `);

  // 7. cron_state — seed 5 rows (v15: added taxonomy_search_index)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cron_state (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  await db.execute(`INSERT OR IGNORE INTO cron_state (key, value) VALUES ('current_phase', '1')`);
  await db.execute(`INSERT OR IGNORE INTO cron_state (key, value) VALUES ('last_successful_run', '')`);
  await db.execute(`INSERT OR IGNORE INTO cron_state (key, value) VALUES ('last_discovery_run', '')`);
  await db.execute(`INSERT OR IGNORE INTO cron_state (key, value) VALUES ('cron_lock', '')`);
  await db.execute(`INSERT OR IGNORE INTO cron_state (key, value) VALUES ('taxonomy_search_index', '0')`);
  await db.execute(`INSERT OR IGNORE INTO cron_state (key, value) VALUES ('baseline_confidence', '')`);
  await db.execute(`INSERT OR IGNORE INTO cron_state (key, value) VALUES ('focus_cluster', 'rain')`);
  await db.execute(`INSERT OR IGNORE INTO cron_state (key, value) VALUES ('pipeline_start_date', '')`);

  // 8. trigger_stats — per-trigger aggregate index (the data moat)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS trigger_stats (
      trigger_slug TEXT PRIMARY KEY,
      video_count INTEGER DEFAULT 0,
      new_this_week INTEGER DEFAULT 0,
      co_occurrence TEXT,
      top_creators TEXT,
      avg_intensity REAL,
      intent_counts TEXT,
      computed_at TEXT
    )
  `);

  // 9. trigger_guides — Opus-generated guide content for non-pillar triggers
  await db.execute(`
    CREATE TABLE IF NOT EXISTS trigger_guides (
      slug TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // 10. creator_profiles — editorial profiles, NOT YouTube mirrors
  await db.execute(`
    CREATE TABLE IF NOT EXISTS creator_profiles (
      slug TEXT PRIMARY KEY,
      channel_id TEXT UNIQUE,
      name TEXT NOT NULL,
      editorial_bio TEXT,
      trigger_specialties TEXT,
      style_tags TEXT,
      signature_videos TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // 11. curated_lists — best-of lists, slug-gated against pillar map
  await db.execute(`
    CREATE TABLE IF NOT EXISTS curated_lists (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      intro TEXT,
      items TEXT NOT NULL,
      faqs TEXT,
      list_type TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      created_at TEXT,
      updated_at TEXT
    )
  `);

  // videos.created_at — directory-entry date for HONEST "new this week"
  // (last_synchronized moves on every re-sync; created_at never does)
  try {
    await db.execute(`ALTER TABLE videos ADD COLUMN created_at TEXT`);
  } catch { /* column exists */ }

  // Seed 13 intent hub rows
  const intents = [
    'sleep', 'study', 'relax', 'tingles', 'anxiety', 'insomnia',
    'meditation', 'background', 'adhd', 'headache', 'depression', 'kids', 'tinnitus',
  ];
  for (const intent of intents) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO active_pages (slug, page_type, sitemap_eligible, publish_phase, video_count, editorial_angle, last_updated)
            VALUES (?, 'intent_hub', TRUE, 0, 0, NULL, datetime('now'))`,
      args: [intent],
    });
  }

  console.log('Database setup complete: 11 tables, 8 cron_state rows, 13 active_pages rows.');
}

setup().catch(console.error);
