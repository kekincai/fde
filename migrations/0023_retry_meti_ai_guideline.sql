-- The source is now reachable from the current official METI page. Requeue
-- the audit row rejected before Japanese "ガイドライン" was recognized as
-- a governance/control signal.
UPDATE ingest_candidates
SET status = 'pending', semantic_decision = 'pending', semantic_confidence = 0,
    semantic_model = '', rejection_reason = '', analyzed_at = NULL
WHERE source_id = 'meti-ai' AND status = 'rejected';
