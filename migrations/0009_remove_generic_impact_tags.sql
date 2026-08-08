UPDATE articles
SET business_impact_tags = CASE
      WHEN lower(title || ' ' || summary) LIKE '%roi%'
        OR lower(title || ' ' || summary) LIKE '%cost%'
        OR title || ' ' || summary LIKE '%コスト%'
        OR title || ' ' || summary LIKE '%費用%' THEN json_array('コスト・ROI')
      WHEN lower(title || ' ' || summary) LIKE '%workflow%'
        OR lower(title || ' ' || summary) LIKE '%automation%'
        OR lower(title || ' ' || summary) LIKE '%productivity%'
        OR title || ' ' || summary LIKE '%業務%'
        OR title || ' ' || summary LIKE '%自動化%' THEN json_array('業務効率')
      WHEN lower(title || ' ' || summary) LIKE '%customer experience%'
        OR lower(title || ' ' || summary) LIKE '%revenue%'
        OR title || ' ' || summary LIKE '%顧客体験%'
        OR title || ' ' || summary LIKE '%売上%' THEN json_array('顧客体験・売上')
      WHEN lower(title || ' ' || summary) LIKE '%security%'
        OR lower(title || ' ' || summary) LIKE '%risk%'
        OR lower(title || ' ' || summary) LIKE '%privacy%'
        OR title || ' ' || summary LIKE '%セキュリティ%'
        OR title || ' ' || summary LIKE '%リスク%' THEN json_array('リスク低減')
      WHEN lower(title || ' ' || summary) LIKE '%regulat%'
        OR lower(title || ' ' || summary) LIKE '%compliance%'
        OR title || ' ' || summary LIKE '%規制%'
        OR title || ' ' || summary LIKE '%法令%' THEN json_array('規制対応')
      WHEN lower(title || ' ' || summary) LIKE '%career%'
        OR lower(title || ' ' || summary) LIKE '%hiring%'
        OR title || ' ' || summary LIKE '%採用%'
        OR title || ' ' || summary LIKE '%人材%' THEN json_array('組織・人材')
      WHEN lower(title || ' ' || summary) LIKE '%deploy%'
        OR lower(title || ' ' || summary) LIKE '%production%'
        OR title || ' ' || summary LIKE '%導入%'
        OR title || ' ' || summary LIKE '%本番%' THEN json_array('導入判断')
      ELSE json('[]')
    END,
    engineering_impact_tags = CASE
      WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%rag%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%retrieval%'
        OR title || ' ' || summary || ' ' || subtopic LIKE '%検索%' THEN json_array('RAG・検索')
      WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%agent%'
        OR title || ' ' || summary || ' ' || subtopic LIKE '%エージェント%' THEN json_array('AIエージェント')
      WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%evaluation%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%benchmark%'
        OR title || ' ' || summary || ' ' || subtopic LIKE '%評価%' THEN json_array('評価・品質')
      WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%security%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%injection%'
        OR title || ' ' || summary || ' ' || subtopic LIKE '%セキュリティ%' THEN json_array('セキュリティ')
      WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%deploy%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%production%'
        OR title || ' ' || summary || ' ' || subtopic LIKE '%本番%' THEN json_array('本番基盤')
      WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%monitor%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%observability%'
        OR title || ' ' || summary || ' ' || subtopic LIKE '%監視%' THEN json_array('監視・運用')
      WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%identity%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%permission%'
        OR title || ' ' || summary || ' ' || subtopic LIKE '%認証%'
        OR title || ' ' || summary || ' ' || subtopic LIKE '%権限%' THEN json_array('認証・権限')
      WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%integration%'
        OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%connector%'
        OR title || ' ' || summary || ' ' || subtopic LIKE '%連携%' THEN json_array('システム連携')
      ELSE json('[]')
    END;
