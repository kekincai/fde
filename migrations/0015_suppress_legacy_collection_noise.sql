-- These rows were collected by superseded broad queries or by the earlier
-- frontend-engineering interpretation. Preserve them for audit, but never
-- show them as current FDE intelligence without a new semantic decision.
UPDATE articles
SET status = 'suppressed',
    rejection_reason = 'legacy source or broad query; awaiting semantic re-evaluation'
WHERE status = 'published'
  AND source_id IN (
    'digital-agency-jp',
    'qiita',
    'qiita-fde',
    'qiita-fde-fieldnotes',
    'chrome-dev'
  );

-- Careers and research are supporting channels. Keep only a small recent
-- baseline until the new per-source limits and semantic review repopulate them.
UPDATE articles
SET status = 'suppressed', rejection_reason = 'legacy career overflow'
WHERE status = 'published' AND content_type = 'career'
  AND id NOT IN (
    SELECT id FROM articles WHERE status = 'published' AND content_type = 'career'
    ORDER BY published_at DESC LIMIT 12
  );

UPDATE articles
SET status = 'suppressed', rejection_reason = 'legacy research overflow'
WHERE status = 'published' AND content_type = 'paper'
  AND id NOT IN (
    SELECT id FROM articles WHERE status = 'published' AND content_type = 'paper'
    ORDER BY published_at DESC LIMIT 10
  );
