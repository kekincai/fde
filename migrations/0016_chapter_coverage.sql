ALTER TABLE sources ADD COLUMN chapter_targets TEXT NOT NULL DEFAULT '[]';
ALTER TABLE articles ADD COLUMN chapter_id TEXT NOT NULL DEFAULT 'customer.use-case';

UPDATE articles
SET chapter_id = CASE core_pillar
  WHEN 'Customer' THEN CASE
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%roi%' OR title || summary LIKE '%効果%' OR title || summary LIKE '%削減%' THEN 'customer.roi'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%workflow%' OR title || summary LIKE '%業務プロセス%' THEN 'customer.process'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%problem%' OR title || summary LIKE '%課題%' THEN 'customer.problem'
    ELSE 'customer.use-case' END
  WHEN 'Build' THEN CASE
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%rag%' OR lower(title || ' ' || summary) LIKE '%retrieval%' THEN 'build.rag'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%connector%' OR lower(title || ' ' || summary) LIKE '%integration%' OR title || summary LIKE '%連携%' THEN 'build.integration'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%legacy%' OR title || summary LIKE '%移行%' THEN 'build.legacy'
    ELSE 'build.agent' END
  WHEN 'Deploy' THEN CASE
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%identity%' OR lower(title || ' ' || summary) LIKE '%permission%' OR title || summary LIKE '%権限%' THEN 'deploy.identity'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%observab%' OR lower(title || ' ' || summary) LIKE '%monitor%' OR title || summary LIKE '%監視%' THEN 'deploy.observability'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%cost%' OR title || summary LIKE '%コスト%' THEN 'deploy.cost'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%on-prem%' OR title || summary LIKE '%閉域%' THEN 'deploy.on-prem'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%data%' OR title || summary LIKE '%データ%' THEN 'deploy.data'
    ELSE 'deploy.cloud' END
  WHEN 'Govern' THEN CASE
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%eval%' OR title || summary LIKE '%評価%' THEN 'govern.evaluation'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%privacy%' OR title || summary LIKE '%個人情報%' THEN 'govern.privacy'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%regulat%' OR lower(title || ' ' || summary) LIKE '%policy%' OR title || summary LIKE '%規制%' OR title || summary LIKE '%ガイドライン%' THEN 'govern.regulation'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%reliab%' OR title || summary LIKE '%障害%' THEN 'govern.reliability'
    ELSE 'govern.security' END
  WHEN 'Organization' THEN CASE
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%coe%' OR title || summary LIKE '%推進組織%' THEN 'organization.coe'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%change management%' OR lower(title || ' ' || summary) LIKE '%adoption%' OR title || summary LIKE '%定着%' THEN 'organization.change'
    WHEN content_type = 'career' OR lower(title || ' ' || summary) LIKE '%career%' OR title || summary LIKE '%採用%' THEN 'organization.talent'
    WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%ai-native%' OR title || summary LIKE '%AIネイティブ%' THEN 'organization.ai-native'
    ELSE 'organization.fde' END
  ELSE 'customer.use-case' END;

CREATE INDEX IF NOT EXISTS idx_articles_chapter_time ON articles(chapter_id, published_at DESC);
