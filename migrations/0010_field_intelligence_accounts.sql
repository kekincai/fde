PRAGMA foreign_keys = ON;

ALTER TABLE articles ADD COLUMN core_pillar TEXT NOT NULL DEFAULT 'Customer';
ALTER TABLE articles ADD COLUMN japan_lens TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN topic_layers TEXT NOT NULL DEFAULT '[]';
ALTER TABLE articles ADD COLUMN affected_stack TEXT NOT NULL DEFAULT '[]';
ALTER TABLE articles ADD COLUMN priority_level TEXT NOT NULL DEFAULT 'P2';
ALTER TABLE articles ADD COLUMN recommended_action TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN evidence TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN relevance_score REAL NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN actionability_score REAL NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN authority_score REAL NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN novelty_score REAL NOT NULL DEFAULT 0.8;
ALTER TABLE articles ADD COLUMN client_fit_score REAL NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN priority_score REAL NOT NULL DEFAULT 0;
ALTER TABLE articles ADD COLUMN published_at_original TEXT;
ALTER TABLE articles ADD COLUMN first_seen_at TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN source_updated_at TEXT;
ALTER TABLE articles ADD COLUMN crawl_run_at TEXT NOT NULL DEFAULT '';
ALTER TABLE articles ADD COLUMN time_confidence REAL NOT NULL DEFAULT 0.1;
ALTER TABLE articles ADD COLUMN dedup_confidence REAL NOT NULL DEFAULT 1;

UPDATE articles
SET core_pillar = CASE
      WHEN pillar IN ('Customer', 'Build', 'Deploy', 'Govern', 'Organization') THEN pillar
      WHEN pillar = 'Japan' AND (
        lower(title || ' ' || summary || ' ' || subtopic) LIKE '%regulat%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%security%'
        OR title || summary || subtopic LIKE '%規制%'
        OR title || summary || subtopic LIKE '%安全%'
        OR title || summary || subtopic LIKE '%ガイドライン%'
      ) THEN 'Govern'
      WHEN pillar = 'Japan' AND (
        lower(title || ' ' || summary || ' ' || subtopic) LIKE '%case stud%'
        OR title || summary || subtopic LIKE '%導入事例%'
        OR title || summary || subtopic LIKE '%活用事例%'
      ) THEN 'Customer'
      WHEN pillar = 'Japan' THEN 'Deploy'
      ELSE 'Customer'
    END,
    japan_lens = CASE
      WHEN region <> 'Japan' THEN ''
      WHEN lower(title || ' ' || summary) LIKE '%regulat%' OR title || summary LIKE '%規制%' OR title || summary LIKE '%ガイドライン%' THEN 'Regulation'
      WHEN lower(title || ' ' || summary) LIKE '%government%' OR title || summary LIKE '%政府%' OR title || summary LIKE '%省庁%' OR title || summary LIKE '%自治体%' THEN 'Government'
      WHEN lower(title || ' ' || summary) LIKE '%case stud%' OR title || summary LIKE '%導入事例%' OR title || summary LIKE '%活用事例%' THEN 'Case Study'
      WHEN content_type = 'career' OR title || summary LIKE '%採用%' OR title || summary LIKE '%エンジニア%' THEN 'Engineering Community'
      ELSE 'Enterprise'
    END,
    topic_layers = json_array(
      CASE
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%identity%' OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%permission%' OR title || summary || subtopic LIKE '%認証%' OR title || summary || subtopic LIKE '%権限%' THEN 'Identity'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%observab%' OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%monitor%' OR title || summary || subtopic LIKE '%監視%' THEN 'Observability'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%integrat%' OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%connector%' OR title || summary || subtopic LIKE '%連携%' THEN 'Integration'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%cost%' OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%roi%' OR title || summary || subtopic LIKE '%コスト%' THEN 'Cost'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%eval%' OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%benchmark%' OR title || summary || subtopic LIKE '%評価%' THEN 'Evaluation'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%human.in.the.loop%' OR title || summary || subtopic LIKE '%人間%' THEN 'Human-in-the-loop'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%change management%' OR title || summary || subtopic LIKE '%定着%' OR title || summary || subtopic LIKE '%組織変革%' THEN 'Change Management'
        WHEN subtopic <> '' THEN subtopic
        ELSE 'AI Delivery'
      END
    ),
    affected_stack = json_array(
      CASE
        WHEN lower(title || ' ' || summary) LIKE '%agent%' THEN 'AI Agent'
        WHEN lower(title || ' ' || summary) LIKE '%rag%' OR lower(title || ' ' || summary) LIKE '%retrieval%' THEN 'RAG'
        WHEN lower(title || ' ' || summary) LIKE '%database%' OR title || summary LIKE '%データベース%' THEN 'Data Platform'
        WHEN lower(title || ' ' || summary) LIKE '%cloud%' THEN 'Cloud'
        WHEN lower(title || ' ' || summary) LIKE '%model%' OR title || summary LIKE '%モデル%' THEN 'Model'
        ELSE 'Delivery Process'
      END
    ),
    published_at_original = published_at,
    first_seen_at = COALESCE(NULLIF(discovered_at, ''), created_at),
    last_seen_at = COALESCE(NULLIF(updated_at, ''), discovered_at, created_at),
    crawl_run_at = COALESCE(NULLIF(updated_at, ''), discovered_at, created_at),
    time_confidence = CASE
      WHEN EXISTS (SELECT 1 FROM sources s WHERE s.id = articles.source_id AND s.fetch_mode IN ('rss', 'api')) THEN 0.9
      ELSE 0.55
    END,
    authority_score = COALESCE((SELECT source_weight FROM sources s WHERE s.id = articles.source_id), 50),
    relevance_score = fde_score,
    client_fit_score = CASE WHEN content_type IN ('case-study', 'release', 'news') THEN 75 WHEN content_type = 'career' THEN 25 ELSE 50 END;

UPDATE articles
SET priority_level = CASE
      WHEN content_type = 'paper' OR content_type = 'report' OR content_type = 'career' THEN 'P2'
      WHEN lower(title || ' ' || summary) LIKE '%vulnerab%'
        OR lower(title || ' ' || summary) LIKE '%critical%'
        OR lower(title || ' ' || summary) LIKE '%breaking change%'
        OR lower(title || ' ' || summary) LIKE '%deprecat%'
        OR lower(title || ' ' || summary) LIKE '%end of life%'
        OR lower(title || ' ' || summary) LIKE '%incident%'
        OR lower(title || ' ' || summary) LIKE '%outage%'
        OR title || summary LIKE '%脆弱性%'
        OR title || summary LIKE '%廃止%'
        OR title || summary LIKE '%障害%'
        OR title || summary LIKE '%期限%'
        THEN 'P0'
      WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%production%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%deploy%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%identity%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%observab%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%integrat%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%cost%'
        OR title || summary || subtopic LIKE '%本番%'
        OR title || summary || subtopic LIKE '%導入%'
        OR title || summary || subtopic LIKE '%運用%'
        THEN 'P1'
      ELSE 'P2'
    END;

UPDATE articles
SET actionability_score = CASE priority_level WHEN 'P0' THEN 95 WHEN 'P1' THEN 75 ELSE 30 END,
    novelty_score = CASE WHEN julianday('now') - julianday(published_at) <= 7 THEN 95 WHEN julianday('now') - julianday(published_at) <= 30 THEN 75 ELSE 45 END,
    priority_score = CASE priority_level WHEN 'P0' THEN 95 WHEN 'P1' THEN 72 ELSE 38 END,
    recommended_action = CASE
      WHEN priority_level = 'P0' AND (lower(title || ' ' || summary) LIKE '%vulnerab%' OR title || summary LIKE '%脆弱性%') THEN '影響を受ける構成と適用済み対策を今日中に確認する'
      WHEN priority_level = 'P0' AND (lower(title || ' ' || summary) LIKE '%deprecat%' OR title || summary LIKE '%廃止%') THEN '利用中のバージョンと移行期限を今日中に確認する'
      WHEN priority_level = 'P0' THEN '対象範囲と期限を確認し、必要なら対応チケットを起票する'
      WHEN priority_level = 'P1' THEN '今週の検証候補に追加し、自社環境で成立条件を確かめる'
      ELSE ''
    END,
    evidence = CASE
      WHEN priority_level = 'P0' THEN '公式情報の緊急性キーワードと公開時刻に基づく自動判定'
      WHEN priority_level = 'P1' THEN '本番導入・運用パターンとの一致に基づく自動判定'
      ELSE '背景理解・中長期学習向けとして自動分類'
    END;

-- A normal incremental crawl must not hide previously collected history.
UPDATE articles
SET status = 'published'
WHERE published_at >= '2026-06-01T00:00:00.000Z'
   OR published_at >= '2026-06-01 00:00:00';

CREATE INDEX IF NOT EXISTS idx_articles_active_priority
  ON articles(status, priority_level, priority_score DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_core_region
  ON articles(core_pillar, region, published_at DESC);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  webauthn_user_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  device_type TEXT NOT NULL DEFAULT '',
  backed_up INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS user_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, article_id)
);

CREATE TABLE IF NOT EXISTS user_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('opened', 'saved', 'unsaved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry ON user_sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkey_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created ON user_bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actions_user_created ON user_actions(user_id, created_at DESC);
