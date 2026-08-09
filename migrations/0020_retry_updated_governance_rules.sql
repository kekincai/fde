-- A rules-only rejection may be reconsidered when the deterministic gate is
-- expanded. Preserve the audit row and let the next fetch update its decision.
UPDATE ingest_candidates
SET status = 'pending', semantic_decision = 'pending', rejection_reason = ''
WHERE source_id = 'ppc-genai-privacy' AND status = 'rejected';
