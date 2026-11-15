CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  channel_id TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  bio TEXT,
  subscriber_count INTEGER DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  channel_age_days INTEGER DEFAULT 0,
  authority_score REAL DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  last_activity_date TEXT,
  flagged_as_spam BOOLEAN DEFAULT FALSE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  channel_id TEXT,
  channel_name TEXT,
  duration_seconds INTEGER,
  publish_date TEXT,
  view_count INTEGER DEFAULT 0,
  primary_trigger TEXT,
  triggers TEXT,
  intents TEXT,
  intensity INTEGER DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
  language TEXT,
  format TEXT,
  modifiers TEXT,
  duration_bucket TEXT,
  roleplay_scenario TEXT,
  confidence REAL,
  is_asmr BOOLEAN,
  status TEXT DEFAULT 'draft',
  last_synchronized TEXT,
  why_watch TEXT,
  editors_pick BOOLEAN DEFAULT FALSE,
  pick_reason TEXT,
  rating_avg REAL,
  rating_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  creator_name TEXT,
  removed_at TEXT -- set by cron dead-check when YouTube no longer has the video
);

CREATE TABLE IF NOT EXISTS hubs (
  id TEXT PRIMARY KEY,
  intent TEXT NOT NULL,
  triggers TEXT NOT NULL,
  duration_min INTEGER,
  duration_max INTEGER,
  video_count INTEGER DEFAULT 0,
  video_count_at_last_update INTEGER DEFAULT 0,
  date_modified TEXT,
  authority_score REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(intent, triggers, duration_min, duration_max)
);

CREATE TABLE IF NOT EXISTS pillars (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_credentials TEXT,
  body TEXT NOT NULL,
  faq TEXT,
  related_pillar_links TEXT,
  date_published TEXT NOT NULL,
  date_modified TEXT,
  backlink_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
  title,
  triggers,
  intents,
  channel_name,
  content=videos,
  content_rowid=rowid
);
CREATE TABLE IF NOT EXISTS live_now (id INTEGER PRIMARY KEY, json TEXT NOT NULL, fetched_at TEXT NOT NULL); -- one row: ASMR streams live on YouTube, refreshed every 3 h by the cron worker
