-- ============================================================
-- 013: Fix create_health_event_atomic function overload (BUG-213)
--
-- BUG-213 (Critical): After running migrations 011 + 012, PostgreSQL
-- has TWO overloads of create_health_event_atomic:
--   - 10-param version (from 011): uses ordinality idx=1 for refund_boost
--   - 11-param version (from 012): uses id-based matching (BUG-205 fix)
--
-- TypeScript code calls without p_dream_fund_id, so PostgreSQL resolves
-- to the 10-param version, making BUG-205's fix ineffective.
--
-- Fix: DROP the old 10-param overload, keep only the 11-param version.
-- Also update TypeScript to always pass p_dream_fund_id.
-- ============================================================

-- ============================================================
-- 1. Drop the old 10-param overload (the one from 011 that uses idx=1)
-- ============================================================
DROP FUNCTION IF EXISTS public.create_health_event_atomic(
  UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[]
);

-- ============================================================
-- 2. Verify only the 11-param version exists
--    (Already created by 012, just confirm GRANTs are correct)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(
  UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(
  UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_health_event_atomic(
  UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT
) FROM anon;

-- ============================================================
-- 3. Also fix the legacy refund_boost in health-impact.ts
--    (Client-side code fix — see TypeScript changes)
-- ============================================================

-- Update comment
COMMENT ON FUNCTION public.create_health_event_atomic(
  UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT
) IS
  'Atomically creates health events and updates buddy vitality. BUG-186: auto-seeds dream_funds. BUG-204: anon access revoked. BUG-205: id-based dream fund matching. BUG-213: dropped old 10-param overload. Uses SELECT ... FOR UPDATE.';
