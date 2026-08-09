ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('member', 'admin'));

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL CHECK (event_name IN (
    'page_view', 'section_view', 'article_open', 'source_click',
    'bookmark_save', 'bookmark_remove'
  )),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_id_hash TEXT NOT NULL DEFAULT '',
  article_id TEXT REFERENCES articles(id) ON DELETE SET NULL,
  section TEXT NOT NULL DEFAULT '',
  device_type TEXT NOT NULL DEFAULT 'desktop'
    CHECK (device_type IN ('desktop', 'tablet', 'mobile')),
  metadata TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_time
  ON analytics_events(event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_article_time
  ON analytics_events(article_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_section_time
  ON analytics_events(section, occurred_at DESC);

