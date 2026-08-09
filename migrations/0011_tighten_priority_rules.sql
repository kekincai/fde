-- P0 is intentionally narrow: recent, authoritative, explicit exposure or breaking change.
UPDATE articles
SET priority_level = CASE
      WHEN content_type IN ('paper', 'report', 'career') THEN 'P2'
      WHEN (
        lower(title || ' ' || summary) LIKE '%production%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%deploy%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%identity%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%observab%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%integrat%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%cost%'
        OR lower(title || ' ' || summary) LIKE '%security%'
        OR title || summary || subtopic LIKE '%本番%'
        OR title || summary || subtopic LIKE '%導入%'
        OR title || summary || subtopic LIKE '%運用%'
        OR title || summary || subtopic LIKE '%安全%'
        OR title || summary || subtopic LIKE '%セキュリティ%'
      ) THEN 'P1'
      ELSE 'P2'
    END;

UPDATE articles
SET priority_level = 'P0'
WHERE status = 'published'
  AND julianday('now') - julianday(published_at) <= 14
  AND content_type NOT IN ('paper', 'report', 'career', 'video')
  AND EXISTS (
    SELECT 1 FROM sources s
    WHERE s.id = articles.source_id
      AND s.source_kind IN ('official', 'platform', 'government', 'media')
  )
  AND (
    lower(title || ' ' || summary) LIKE '%vulnerab%'
    OR lower(title || ' ' || summary) LIKE '%critical cve%'
    OR lower(title || ' ' || summary) LIKE '%data breach%'
    OR lower(title || ' ' || summary) LIKE '%actively exploited%'
    OR lower(title || ' ' || summary) LIKE '%breaking change%'
    OR lower(title || ' ' || summary) LIKE '%deprecated%'
    OR lower(title || ' ' || summary) LIKE '%end of life%'
    OR lower(title || ' ' || summary) LIKE '%service termination%'
    OR title || summary LIKE '%脆弱性%'
    OR title || summary LIKE '%侵害%'
    OR title || summary LIKE '%情報漏えい%'
    OR title || summary LIKE '%提供終了%'
    OR title || summary LIKE '%破壊的変更%'
  );

UPDATE articles
SET actionability_score = CASE priority_level WHEN 'P0' THEN 95 WHEN 'P1' THEN 75 ELSE 30 END,
    priority_score = CASE priority_level WHEN 'P0' THEN 95 WHEN 'P1' THEN 72 ELSE 38 END,
    recommended_action = CASE
      WHEN priority_level = 'P0' AND (
        lower(title || ' ' || summary) LIKE '%vulnerab%'
        OR lower(title || ' ' || summary) LIKE '%critical cve%'
        OR lower(title || ' ' || summary) LIKE '%data breach%'
        OR title || summary LIKE '%脆弱性%'
        OR title || summary LIKE '%侵害%'
        OR title || summary LIKE '%情報漏えい%'
      ) THEN '影響を受ける構成と適用済み対策を今日中に確認する'
      WHEN priority_level = 'P0' THEN '利用中のバージョンと移行期限を今日中に確認する'
      WHEN priority_level = 'P1' THEN '今週の検証候補に追加し、自社環境で成立条件を確かめる'
      ELSE ''
    END,
    evidence = CASE
      WHEN priority_level = 'P0' THEN '直近の公式情報にある明確な影響・変更シグナルに基づく自動判定'
      WHEN priority_level = 'P1' THEN '本番導入・運用パターンとの一致に基づく自動判定'
      ELSE '背景理解・中長期学習向けとして自動分類'
    END;
