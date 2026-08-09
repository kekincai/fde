-- Correct baseline taxonomy introduced by 0016. Career records belong to the
-- talent chapter regardless of the historical broad pillar assigned to them.
UPDATE articles
SET chapter_id = 'organization.talent',
    core_pillar = 'Organization',
    collection_stream = 'talent'
WHERE content_type = 'career';

-- Restore meaningful collection streams for records created before the
-- chapter-driven ingestion pipeline existed.
UPDATE articles
SET collection_stream = CASE content_type
  WHEN 'case-study' THEN 'customer-outcome'
  WHEN 'release' THEN 'official-change'
  WHEN 'paper' THEN 'research'
  WHEN 'report' THEN CASE WHEN region = 'Japan' THEN 'japan-government' ELSE 'report' END
  WHEN 'video' THEN 'video'
  WHEN 'career' THEN 'talent'
  ELSE CASE WHEN region = 'Japan' THEN 'japan-enterprise' ELSE 'production-pattern' END
END
WHERE collection_stream = '' OR collection_stream = 'production-pattern';
