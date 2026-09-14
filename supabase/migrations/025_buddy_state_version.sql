-- Migration 025: Add version column to buddy_state for optimistic locking
-- TECH-DEBT-B: Prevents silent data loss from concurrent PUTs

-- Add version column (defaults to 1 for existing rows)
ALTER TABLE buddy_state ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Create index for efficient version checks
CREATE INDEX IF NOT EXISTS idx_buddy_state_version ON buddy_state (user_id, version);

-- Comment
COMMENT ON COLUMN buddy_state.version IS 'Optimistic locking version — incremented on each PUT, CAS prevents concurrent writes';
