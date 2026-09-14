-- ============================================================
-- Migration 124: Idempotent fix for ai_audit_logs schema
--
-- 🔧 ARCH fix (2026-07-21): Migration 123 failed with "column s does not exist"
--    because it was not idempotent. If the column was already renamed (partial
--    run or manual rename), the RENAME COLUMN statement fails.
--
-- This migration is FULLY IDEMPOTENT — safe to run multiple times regardless
-- of the current DB state. It handles all possible states:
--   State A: Column is still "s" (migration 123 never ran)
--   State B: Column is already "tool_calls" (migration 123 partially ran)
--   State C: Column is something else entirely (shouldn't happen, but handled)
--
-- After this migration, the DB will be in the desired state:
--   - Column name: tool_calls
--   - Action values: 'tool_call' (not empty string)
--   - CHECK constraint: includes 'tool_call' (not empty string)
-- ============================================================

-- Step 1: Rename column s → tool_calls (only if "s" exists and "tool_calls" doesn't)
DO $$
BEGIN
  -- Check if column "s" exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_audit_logs'
      AND column_name = 's'
  ) THEN
    -- Check if column "tool_calls" already exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'ai_audit_logs'
        AND column_name = 'tool_calls'
    ) THEN
      EXECUTE 'ALTER TABLE ai_audit_logs RENAME COLUMN s TO tool_calls';
      RAISE NOTICE 'Renamed column s → tool_calls';
    ELSE
      -- Both "s" and "tool_calls" exist — drop "s" (shouldn't happen, but safe)
      EXECUTE 'ALTER TABLE ai_audit_logs DROP COLUMN s';
      RAISE NOTICE 'Dropped duplicate column s (tool_calls already exists)';
    END IF;
  ELSE
    RAISE NOTICE 'Column s does not exist (already renamed or never existed) — skipping rename';
  END IF;
END $$;

-- Step 2: Update existing rows with empty-string action to 'tool_call'
-- This is safe to run multiple times — if no rows have action='', 0 rows are updated
UPDATE ai_audit_logs SET action = 'tool_call' WHERE action = '';

-- Step 3: Drop and recreate the CHECK constraint (idempotent)
-- Drop if exists (safe if it doesn't exist)
ALTER TABLE ai_audit_logs DROP CONSTRAINT IF EXISTS ai_audit_logs_action_check;

-- Add the constraint with 'tool_call' instead of empty string
ALTER TABLE ai_audit_logs ADD CONSTRAINT ai_audit_logs_action_check
  CHECK (action IN (
    'consume_recommend',
    'consume_intercept',
    'tool_call',
    'challenge_judge',
    'constitution_violation'
  ));

-- Step 4: Update column comment (idempotent — COMMENT just overwrites)
COMMENT ON COLUMN ai_audit_logs.tool_calls IS 'Tool calls (JSON array: name + arguments + result)';

-- ============================================================
-- Verification queries (run manually to confirm):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'ai_audit_logs' ORDER BY ordinal_position;
--
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'ai_audit_logs'::regclass AND contype = 'c';
-- ============================================================
