-- Chapter classification is more specific than the historical broad pillar.
-- Reclassify only explicit, high-confidence operational terms.
UPDATE articles
SET chapter_id = CASE
      WHEN lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%privacy%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%personal data%'
        OR title || summary LIKE '%個人情報%' OR title || summary LIKE '%プライバシー%' THEN 'govern.privacy'
      WHEN lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%on-prem%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%on prem%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%private cloud%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%air-gapped%'
        OR title || summary LIKE '%閉域%' OR title || summary LIKE '%オンプレ%' THEN 'deploy.on-prem'
      WHEN lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%observab%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%monitoring%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%telemetry%'
        OR title || summary LIKE '%可観測%' OR title || summary LIKE '%監視%' THEN 'deploy.observability'
      WHEN lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%identity%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%permission%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%authentication%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%authorization%'
        OR title || summary LIKE '%認証%' OR title || summary LIKE '%権限%' THEN 'deploy.identity'
      WHEN lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%legacy%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%modernization%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%mainframe%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%cobol%'
        OR title || summary LIKE '%レガシー%' OR title || summary LIKE '%刷新%' THEN 'build.legacy'
      WHEN lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%center of excellence%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%ai coe%'
        OR title || summary LIKE '%推進組織%' OR title || summary LIKE '%横断組織%' THEN 'organization.coe'
      WHEN lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%connector%'
        OR lower(title || ' ' || summary || ' ' || subtopic || ' ' || topic_layers) LIKE '%integration%'
        OR title || summary LIKE '%連携%' OR title || summary LIKE '%コネクタ%' THEN 'build.integration'
      ELSE chapter_id
    END
WHERE status = 'published';

UPDATE articles
SET core_pillar = CASE
  WHEN chapter_id LIKE 'build.%' THEN 'Build'
  WHEN chapter_id LIKE 'deploy.%' THEN 'Deploy'
  WHEN chapter_id LIKE 'govern.%' THEN 'Govern'
  WHEN chapter_id LIKE 'organization.%' THEN 'Organization'
  ELSE core_pillar END
WHERE status = 'published';
