CREATE TABLE IF NOT EXISTS request_rate_limits (
  key_hash TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count >= 0),
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_expiry
  ON request_rate_limits(expires_at);
