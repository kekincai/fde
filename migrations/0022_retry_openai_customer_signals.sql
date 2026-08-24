-- OpenAI customer stories are present in the official News RSS, but older
-- parser rules did not recognize ChatGPT/Codex as AI terms and rejected them
-- before semantic review. Keep the audit rows and requeue only the affected
-- recent window after the deterministic gate is upgraded.
UPDATE ingest_candidates
SET status = 'pending', semantic_decision = 'pending', semantic_confidence = 0,
    semantic_model = '', rejection_reason = '', analyzed_at = NULL
WHERE source_id = 'openai-news'
  AND status = 'rejected'
  AND first_seen_at >= '2026-08-18 00:00:00';
