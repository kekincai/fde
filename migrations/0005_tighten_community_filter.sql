-- Community search APIs may match an FDE term buried anywhere in a long body.
-- Keep direct FDE titles, or explicit AI titles whose summary also describes
-- customer/enterprise delivery, production, or evaluation. Hide the rest.
UPDATE articles
SET status = 'legacy'
WHERE source_id IN ('qiita-fde-fieldnotes', 'zenn-genai-fieldnotes')
  AND NOT (
    title LIKE '%FDE%'
    OR lower(title) LIKE '%forward deployed%'
    OR title LIKE '%フォワード%'
    OR (
      (
        title LIKE '%AI%'
        OR title LIKE '%生成AI%'
        OR title LIKE '%OpenAI%'
        OR title LIKE '%Codex%'
        OR title LIKE '%Claude%'
        OR title LIKE '%Anthropic%'
      )
      AND (
        summary LIKE '%導入%'
        OR summary LIKE '%顧客%'
        OR summary LIKE '%企業%'
        OR summary LIKE '%本番%'
        OR summary LIKE '%評価%'
        OR lower(summary) LIKE '%customer%'
        OR lower(summary) LIKE '%enterprise%'
        OR lower(summary) LIKE '%deployment%'
        OR lower(summary) LIKE '%production%'
        OR lower(summary) LIKE '%evaluation%'
      )
    )
  );
