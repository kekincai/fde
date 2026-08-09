-- The public baseline starts on 2026-06-01. Keep older records for audit and
-- possible future historical views, but remove them from every public feed.
UPDATE articles
SET status = 'archived', updated_at = CURRENT_TIMESTAMP
WHERE status = 'published' AND published_at < '2026-06-01T00:00:00.000Z';
