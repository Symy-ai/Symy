-- ============================================================
-- Migration 123: Rename ai_audit_logs.s -> tool_calls + fix empty action
--
-- ARCH fix (2026-07-21): Two legacy schema bugs in ai_audit_logs:
--
-- 1. Column s (should be tool_calls)
--    The column was named s - a meaningless single-letter name that gives
--    no hint about its contents (tool call records). This is a naming bug
--    from the original migration (019_ai_audit_logs.sql).
--
-- 2. Action empty string (should be tool_call)
--    The CHECK constraint allows action IN (consume_recommend, consume_intercept, empty, challenge_judge, constitution_violation).
--    The empty string was a placeholder for MCP tool call that was
--    never properly named. This makes querying for MCP tool calls confusing
--    (WHERE action = empty) and the TypeScript type has empty string as a valid
--    AIAuditAction - a code smell.
--
-- This migration:
--   a) Renames column s to tool_calls
--   b) Updates existing rows: SET action = tool_call WHERE action = empty
--   c) Drops and recreates the CHECK constraint with tool_call instead of empty
--
-- Manual step required after migration:
--    Run npm run typegen (or manually update src/lib/database.types.ts)
--    to regenerate TypeScript types with the new column name.
-- ============================================================

-- Step 1: Rename column s to tool_calls
ALTER TABLE ai_audit_logs RENAME COLUMN s TO tool_calls;

-- Step 2: Update existing rows with empty-string action to tool_call
UPDATE ai_audit_logs SET action = 'tool_call' WHERE action = '';

-- Step 3: Drop and recreate the CHECK constraint
ALTER TABLE ai_audit_logs DROP CONSTRAINT IF EXISTS ai_audit_logs_action_check;

ALTER TABLE ai_audit_logs ADD CONSTRAINT ai_audit_logs_action_check
  CHECK (action IN (
    'consume_recommend',
    'consume_intercept',
    'tool_call',
    'challenge_judge',
    'constitution_violation'
  ));

-- Step 4: Update column comment
COMMENT ON COLUMN ai_audit_logs.tool_calls IS 'Tool calls (JSON array: name + arguments + result)';
