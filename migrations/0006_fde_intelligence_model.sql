ALTER TABLE sources ADD COLUMN content_type TEXT NOT NULL DEFAULT 'news';
ALTER TABLE sources ADD COLUMN default_pillar TEXT NOT NULL DEFAULT 'Customer';
ALTER TABLE sources ADD COLUMN source_tier INTEGER NOT NULL DEFAULT 3;
ALTER TABLE sources ADD COLUMN source_weight INTEGER NOT NULL DEFAULT 50;
ALTER TABLE sources ADD COLUMN min_fde_score INTEGER NOT NULL DEFAULT 60;

ALTER TABLE articles ADD COLUMN pillar TEXT NOT NULL DEFAULT 'Customer';
ALTER TABLE articles ADD COLUMN subtopic TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN content_type TEXT NOT NULL DEFAULT 'news';
ALTER TABLE articles ADD COLUMN region TEXT NOT NULL DEFAULT 'Global';
ALTER TABLE articles ADD COLUMN summary_ja TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN summary_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN customer_impact TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN engineering_impact TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS article_versions (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL REFERENCES articles(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  content_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(article_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_article_versions_article
  ON article_versions(article_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_pillar_published
  ON articles(pillar, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_type_published
  ON articles(content_type, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_region_published
  ON articles(region, published_at DESC);

-- Reclassify every public record with the new 0-100 model on the next crawl.
UPDATE articles SET status = 'legacy' WHERE status = 'published';
UPDATE articles SET updated_at = CURRENT_TIMESTAMP WHERE updated_at = '';
UPDATE sources SET allowed_fetch = 0;
