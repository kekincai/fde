PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  homepage TEXT NOT NULL,
  feed_url TEXT,
  api_url TEXT,
  fetch_mode TEXT NOT NULL CHECK (fetch_mode IN ('api', 'rss', 'html')),
  language TEXT NOT NULL DEFAULT 'ja',
  country TEXT NOT NULL DEFAULT 'JP',
  priority INTEGER NOT NULL DEFAULT 50,
  poll_interval_minutes INTEGER NOT NULL DEFAULT 1440,
  allowed_fetch INTEGER NOT NULL DEFAULT 1,
  allowed_snippet INTEGER NOT NULL DEFAULT 1,
  copyright_policy TEXT NOT NULL DEFAULT 'metadata-and-short-summary',
  robots_checked_at TEXT,
  tos_reviewed_at TEXT,
  parser_version TEXT NOT NULL DEFAULT '1',
  etag TEXT,
  last_modified TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  backoff_until TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  canonical_url_hash TEXT NOT NULL UNIQUE,
  external_item_id TEXT,
  source_id TEXT NOT NULL REFERENCES sources(id),
  title TEXT NOT NULL,
  title_normalized TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'ja',
  country_relevance TEXT NOT NULL DEFAULT 'JP',
  topic TEXT NOT NULL DEFAULT 'Frontend',
  tags TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  japan_score REAL NOT NULL DEFAULT 0,
  quality_score REAL NOT NULL DEFAULT 0,
  trend_score REAL NOT NULL DEFAULT 0,
  cluster_id TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source_published ON articles(source_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_topic_published ON articles(topic, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_country_published ON articles(country_relevance, published_at DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  article_id UNINDEXED,
  title,
  summary,
  tags,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS fetch_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  status TEXT NOT NULL,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  unique_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT,
  topics TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT 'personal',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id),
  visitor_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(article_id, visitor_key)
);
