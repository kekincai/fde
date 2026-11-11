-- Removes schema that nothing reads any more (audit 2026-11-10, items 24, 40, 44, 45).
--
-- ORDER MATTERS: deploy the Worker that no longer writes these columns and tables
-- BEFORE applying this migration. The previous Worker still writes them and would
-- fail on every insert once they are gone.
--
-- Kept on purpose, and still written by the Worker:
--   articles.canonical_url_hash  UNIQUE constraint; SQLite cannot drop it without a table rebuild.
--   articles.title_normalized    NOT NULL without a default, so the Worker must keep writing it
--                                for the deploy-before-migrate order above to work.
-- Every column dropped below has a default, so the new Worker runs on either schema.

-- Japan is a lens across the five pillars, not a pillar (README). Rows written by
-- the old inferPillar carry 'Japan'; give them their core pillar instead.
UPDATE articles SET pillar = core_pillar
WHERE pillar = 'Japan' AND core_pillar IN ('Customer', 'Build', 'Deploy', 'Govern', 'Organization');

-- Columns that are written but never read.
DROP INDEX IF EXISTS idx_articles_topic_published;
ALTER TABLE articles DROP COLUMN topic;
ALTER TABLE articles DROP COLUMN japan_score;
ALTER TABLE articles DROP COLUMN quality_score;
ALTER TABLE articles DROP COLUMN trend_score;
ALTER TABLE articles DROP COLUMN cluster_id;
ALTER TABLE articles DROP COLUMN company_impact;
ALTER TABLE articles DROP COLUMN career_impact;
ALTER TABLE articles DROP COLUMN customer_impact;
ALTER TABLE articles DROP COLUMN engineering_impact;
ALTER TABLE articles DROP COLUMN summary_zh;
ALTER TABLE articles DROP COLUMN business_impact_tags;
ALTER TABLE articles DROP COLUMN engineering_impact_tags;
ALTER TABLE articles DROP COLUMN event_fingerprint;
ALTER TABLE articles DROP COLUMN dedup_confidence;

ALTER TABLE sources DROP COLUMN allowed_snippet;
ALTER TABLE sources DROP COLUMN copyright_policy;

-- Tables that are written but never read, or never used at all (0001 leftovers).
DROP INDEX IF EXISTS idx_actions_user_created;
DROP TABLE IF EXISTS user_actions;
DROP INDEX IF EXISTS idx_article_versions_article;
DROP TABLE IF EXISTS article_versions;
DROP TABLE IF EXISTS bookmarks;
DROP TABLE IF EXISTS subscriptions;

-- The daily digest selects articles by when they were first seen. The expression is
-- the one in worker/emailNotifications.ts (FIRST_SEEN), so the range scan can use it.
CREATE INDEX IF NOT EXISTS idx_articles_first_seen
  ON articles(datetime(COALESCE(NULLIF(first_seen_at, ''), discovered_at, created_at)));
