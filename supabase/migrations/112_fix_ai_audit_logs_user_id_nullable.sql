-- ============================================================
-- 108: Fix ai_audit_logs.user_id NOT NULL blocking user deletion (CRITICAL-12)
-- ============================================================
-- 🔧 2026-07-15 (ARCH-13-15 #1 / CRITICAL-12 修复)
--
-- Bug: Migration 048 changed ai_audit_logs FK from ON DELETE CASCADE to
--   ON DELETE SET NULL, but forgot to also DROP NOT NULL on user_id.
--   Postgres cannot set a NOT NULL column to NULL → the entire
--   DELETE FROM auth.users transaction aborts.
--   GDPR Article 17 (right to erasure) is completely non-functional.
--
-- Fix: ALTER COLUMN user_id DROP NOT NULL.
--   Now when a user is deleted, ai_audit_logs.user_id is set to NULL
--   (tombstone marker — audit log retained for compliance, but no PII link).
--
-- Safety: This is a non-breaking schema change. Existing rows are unaffected.
--   New rows still require user_id (NOT NULL on INSERT is enforced by app code).
--   Only UPDATE/DELETE triggers can set it to NULL.
-- ============================================================

-- Check current state (idempotent)
DO $$
BEGIN
    -- Only execute if user_id is still NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ai_audit_logs'
          AND column_name = 'user_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.ai_audit_logs ALTER COLUMN user_id DROP NOT NULL;
        RAISE NOTICE 'ai_audit_logs.user_id NOT NULL constraint dropped (CRITICAL-12 fix)';
    ELSE
        RAISE NOTICE 'ai_audit_logs.user_id is already nullable — skip';
    END IF;
END;
$$;

COMMENT ON COLUMN public.ai_audit_logs.user_id IS
  '2026-07-15 (CRITICAL-12): DROP NOT NULL — allows ON DELETE SET NULL to work when user is deleted (GDPR Article 17). Tombstone rows have user_id=NULL but retain audit data for compliance.';
