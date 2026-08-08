-- Optional archive storage for the existing minipc-postgres-hyperdrive config.
-- D1 remains the source of truth for article metadata and Japanese FTS5 search.
CREATE SCHEMA IF NOT EXISTS fde;

CREATE TABLE IF NOT EXISTS fde.source_archives (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('api', 'rss', 'html')),
  content_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source_id, content_hash)
);

CREATE INDEX IF NOT EXISTS source_archives_source_fetched_idx
  ON fde.source_archives (source_id, fetched_at DESC);
