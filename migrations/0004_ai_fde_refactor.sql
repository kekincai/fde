ALTER TABLE sources ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'deployment';

ALTER TABLE articles ADD COLUMN signal_type TEXT NOT NULL DEFAULT '導入事例';
ALTER TABLE articles ADD COLUMN location TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN sector TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN fde_score REAL NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN why_it_matters TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN company_impact TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN career_impact TEXT NOT NULL DEFAULT '';

-- The former dataset described frontend engineering. Keep it auditable, but
-- remove it from every public query instead of destructively deleting it.
UPDATE articles SET status = 'legacy' WHERE source_id IN (
  'publickey', 'qiita', 'mercari-engineering', 'line-engineering', 'chrome-dev'
);
UPDATE sources SET allowed_fetch = 0 WHERE id IN (
  'publickey', 'qiita', 'mercari-engineering', 'line-engineering', 'chrome-dev'
);

INSERT INTO sources (
  id, name, homepage, feed_url, api_url, fetch_mode, language, country,
  source_kind, priority, poll_interval_minutes, allowed_fetch,
  robots_checked_at, tos_reviewed_at, parser_version
) VALUES
  ('openai-deployments', 'OpenAI', 'https://openai.com/news/', 'https://openai.com/news/rss.xml', NULL, 'rss', 'en', 'GLOBAL', 'deployment', 100, 360, 1, '2026-08-09', '2026-08-09', '2'),
  ('anthropic-careers', 'Anthropic Careers', 'https://www.anthropic.com/careers/jobs', NULL, 'https://boards-api.greenhouse.io/v1/boards/anthropic/jobs?content=true', 'api', 'en', 'GLOBAL', 'careers', 96, 720, 1, '2026-08-09', '2026-08-09', '2'),
  ('scale-ai-careers', 'Scale AI Careers', 'https://scale.com/careers', NULL, 'https://boards-api.greenhouse.io/v1/boards/scaleai/jobs?content=true', 'api', 'en', 'GLOBAL', 'careers', 94, 720, 1, '2026-08-09', '2026-08-09', '2'),
  ('palantir-deployments', 'Palantir Blog', 'https://blog.palantir.com/', 'https://blog.palantir.com/feed', NULL, 'rss', 'en', 'GLOBAL', 'deployment', 92, 720, 1, '2026-08-09', '2026-08-09', '2'),
  ('ai-native-fde-career', 'AI Native Careers', 'https://www.ai-native.jp/careers/forward-deployed-engineer', NULL, NULL, 'html', 'ja', 'JP', 'careers', 91, 1440, 1, '2026-08-09', '2026-08-09', '2'),
  ('tokyodev-ai-jobs', 'TokyoDev', 'https://www.tokyodev.com/jobs', NULL, NULL, 'html', 'en', 'JP', 'careers', 86, 720, 1, '2026-08-09', '2026-08-09', '2'),
  ('qiita-fde-fieldnotes', 'Qiita', 'https://qiita.com/', NULL, 'https://qiita.com/api/v2/items?per_page=30&query=FDE%20OR%20%22Forward%20Deployed%20Engineer%22', 'api', 'ja', 'JP', 'community', 82, 360, 1, '2026-08-09', '2026-08-09', '2'),
  ('zenn-genai-fieldnotes', 'Zenn', 'https://zenn.dev/topics/%E7%94%9F%E6%88%90ai', 'https://zenn.dev/topics/%E7%94%9F%E6%88%90ai/feed', NULL, 'rss', 'ja', 'JP', 'community', 80, 360, 1, '2026-08-09', '2026-08-09', '2'),
  ('yahoo-japan-it', 'Yahoo!ニュース IT', 'https://news.yahoo.co.jp/categories/it', 'https://news.yahoo.co.jp/rss/topics/it.xml', NULL, 'rss', 'ja', 'JP', 'news', 76, 180, 1, '2026-08-09', '2026-08-09', '2')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  homepage = excluded.homepage,
  feed_url = excluded.feed_url,
  api_url = excluded.api_url,
  fetch_mode = excluded.fetch_mode,
  language = excluded.language,
  country = excluded.country,
  source_kind = excluded.source_kind,
  priority = excluded.priority,
  poll_interval_minutes = excluded.poll_interval_minutes,
  allowed_fetch = 1,
  parser_version = '2',
  updated_at = CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_articles_fde_published
  ON articles(status, fde_score DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_signal_published
  ON articles(signal_type, published_at DESC);
