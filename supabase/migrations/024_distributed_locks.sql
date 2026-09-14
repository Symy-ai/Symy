-- Migration 024: distributed_locks table
-- Replaces in-memory Map-based dedup/rate-limiting that doesn't work in serverless
-- Key = lock identifier, value = metadata (JSONB), expires_at = auto-release

CREATE TABLE IF NOT EXISTS distributed_locks (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient GC (delete expired rows)
CREATE INDEX IF NOT EXISTS idx_distributed_locks_expires_at ON distributed_locks (expires_at);

-- No RLS needed — only accessed via service_role key from API routes
-- (this table is internal infrastructure, not user data)

-- Add comment
COMMENT ON TABLE distributed_locks IS 'Distributed lock & rate limiting — replaces in-memory Maps that do not work across serverless instances';
