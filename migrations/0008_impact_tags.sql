ALTER TABLE articles ADD COLUMN relevance_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE articles ADD COLUMN business_impact_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE articles ADD COLUMN engineering_impact_tags TEXT NOT NULL DEFAULT '[]';

UPDATE articles
SET relevance_tags = json_array(
      CASE pillar
        WHEN 'Customer' THEN '顧客課題'
        WHEN 'Build' THEN '実装手法'
        WHEN 'Deploy' THEN '本番導入'
        WHEN 'Govern' THEN 'リスク管理'
        WHEN 'Organization' THEN '組織・人材'
        WHEN 'Japan' THEN '日本市場'
        ELSE 'FDE'
      END,
      subtopic
    ),
    business_impact_tags = json_array(
      CASE
        WHEN lower(title || ' ' || summary) LIKE '%roi%' OR title || ' ' || summary LIKE '%コスト%' THEN 'コスト・ROI'
        WHEN lower(title || ' ' || summary) LIKE '%workflow%' OR title || ' ' || summary LIKE '%業務%' THEN '業務効率'
        WHEN lower(title || ' ' || summary) LIKE '%security%' OR lower(title || ' ' || summary) LIKE '%risk%' THEN 'リスク低減'
        WHEN lower(title || ' ' || summary) LIKE '%regulat%' OR lower(title || ' ' || summary) LIKE '%compliance%' THEN '規制対応'
        WHEN pillar = 'Organization' THEN '組織・人材'
        WHEN pillar = 'Japan' THEN '国内導入'
        WHEN pillar = 'Deploy' THEN '運用体制'
        WHEN pillar = 'Build' THEN '技術投資'
        ELSE '業務改善'
      END
    ),
    engineering_impact_tags = json_array(
      CASE
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%rag%' OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%retrieval%' THEN 'RAG・検索'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%agent%' THEN 'AIエージェント'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%evaluation%' OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%benchmark%' THEN '評価・品質'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%security%' OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%injection%' THEN 'セキュリティ'
        WHEN lower(title || ' ' || summary || ' ' || subtopic) LIKE '%deploy%' OR lower(title || ' ' || summary || ' ' || subtopic) LIKE '%production%' THEN '本番基盤'
        WHEN pillar = 'Govern' THEN '評価・統制'
        WHEN pillar = 'Deploy' THEN '本番基盤'
        WHEN pillar = 'Organization' THEN '開発体制'
        WHEN pillar = 'Japan' THEN '国内要件'
        ELSE 'AI実装'
      END
    ),
    why_it_matters = '',
    company_impact = '',
    career_impact = '',
    customer_impact = '',
    engineering_impact = '';
