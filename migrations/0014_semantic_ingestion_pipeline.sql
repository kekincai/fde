PRAGMA foreign_keys = ON;

ALTER TABLE sources ADD COLUMN collection_stream TEXT NOT NULL DEFAULT 'production-pattern';
ALTER TABLE sources ADD COLUMN semantic_policy TEXT NOT NULL DEFAULT 'required';
ALTER TABLE sources ADD COLUMN daily_item_cap INTEGER NOT NULL DEFAULT 20;

ALTER TABLE articles ADD COLUMN semantic_decision TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE articles ADD COLUMN semantic_confidence REAL NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN semantic_model TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN semantic_analyzed_at TEXT;
ALTER TABLE articles ADD COLUMN rejection_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN collection_stream TEXT NOT NULL DEFAULT 'production-pattern';
ALTER TABLE articles ADD COLUMN event_fingerprint TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS ingest_candidates (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  canonical_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  hard_gate_decision TEXT NOT NULL,
  hard_gate_score REAL NOT NULL DEFAULT 0,
  hard_gate_reasons TEXT NOT NULL DEFAULT '[]',
  semantic_decision TEXT NOT NULL DEFAULT 'pending',
  semantic_confidence REAL NOT NULL DEFAULT 0,
  semantic_model TEXT NOT NULL DEFAULT '',
  rejection_reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  analyzed_at TEXT,
  published_article_id TEXT REFERENCES articles(id),
  UNIQUE(source_id, canonical_url, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_candidates_status_seen ON ingest_candidates(status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_source_seen ON ingest_candidates(source_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_stream_time ON articles(collection_stream, published_at DESC);

CREATE TABLE IF NOT EXISTS source_quality_daily (
  source_id TEXT NOT NULL REFERENCES sources(id),
  day TEXT NOT NULL,
  discovered_count INTEGER NOT NULL DEFAULT 0,
  hard_rejected_count INTEGER NOT NULL DEFAULT 0,
  semantic_reviewed_count INTEGER NOT NULL DEFAULT 0,
  semantic_rejected_count INTEGER NOT NULL DEFAULT 0,
  published_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  ai_error_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(source_id, day)
);

-- Preserve history for audit, but remove clearly off-topic broad government
-- notices from the public feed. They can be re-evaluated from candidates later.
UPDATE articles
SET status = 'suppressed', rejection_reason = 'legacy broad government feed without AI/FDE context'
WHERE source_id = 'digital-agency-jp'
  AND lower(title || ' ' || summary) NOT LIKE '%ai%'
  AND title || summary NOT LIKE '%生成AI%'
  AND title || summary NOT LIKE '%人工知能%'
  AND title || summary NOT LIKE '%Gennai%';

-- Research is a supporting channel, not the main feed. Keep a small recent
-- window visible until each item is re-evaluated by the new pipeline.
UPDATE articles
SET status = 'suppressed', rejection_reason = 'legacy research overflow; awaiting semantic re-evaluation'
WHERE source_id = 'arxiv-fde-research'
  AND id NOT IN (
    SELECT id FROM articles WHERE source_id = 'arxiv-fde-research'
    ORDER BY published_at DESC LIMIT 30
  );
