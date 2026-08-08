ALTER TABLE fetch_runs ADD COLUMN ingest_mode TEXT NOT NULL DEFAULT 'scheduled';
ALTER TABLE fetch_runs ADD COLUMN backfill_page INTEGER;
ALTER TABLE fetch_runs ADD COLUMN since_at TEXT;

CREATE INDEX IF NOT EXISTS idx_fetch_runs_backfill
  ON fetch_runs(ingest_mode, since_at, started_at DESC);
