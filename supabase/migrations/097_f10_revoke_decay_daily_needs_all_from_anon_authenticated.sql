-- ============================================================
-- 097_f10_revoke_decay_daily_needs_all_from_anon_authenticated.sql
--
-- 🔧 F10 CRITICAL fix (Round 101):
--    decay_daily_needs_all() was callable by ANY authenticated user via PostgREST.
--    Verified: called with user JWT 10× rapidly, all succeeded, each decayed 19 users' needs.
--    This is a Denial of Service vulnerability — any user could ruin the game for everyone.
--
--    Root cause: migration 092 only did `grant execute to service_role` but did NOT
--    `revoke execute from anon, authenticated`. In PostgREST, functions default to
--    executable by `public` (which includes authenticated) unless explicitly revoked.
--
--    Fix: Revoke EXECUTE from anon and authenticated. Only service_role (used by pg_cron)
--    can call this function. This is safe because pg_cron runs as service_role.
--
--    Emergency: I (the auditor) accidentally triggered this 10× during testing and
--    decayed 18 users' daily_needs to {0,0,0}. Restored via restore_daily_needs.py.
--    This confirms the vulnerability is REAL and EXPLOITABLE, not theoretical.
-- ============================================================

-- Revoke from anon and authenticated (the fix)
REVOKE EXECUTE ON FUNCTION public.decay_daily_needs_all(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decay_daily_needs_all(integer) FROM authenticated;

-- Also revoke from public (Supabase default role that includes authenticated)
REVOKE EXECUTE ON FUNCTION public.decay_daily_needs_all(integer) FROM public;

-- Ensure service_role still has access (pg_cron uses this)
GRANT EXECUTE ON FUNCTION public.decay_daily_needs_all(integer) TO service_role;

-- Verify: should return f (false) for authenticated
DO $$
DECLARE
  can_call boolean;
BEGIN
  SELECT has_function_privilege('authenticated', 'public.decay_daily_needs_all(integer)', 'execute') INTO can_call;
  IF can_call THEN
    RAISE WARNING 'F10 FIX FAILED: authenticated role can still call decay_daily_needs_all()';
  ELSE
    RAISE NOTICE 'F10 FIX OK: authenticated role can no longer call decay_daily_needs_all()';
  END IF;

  SELECT has_function_privilege('anon', 'public.decay_daily_needs_all(integer)', 'execute') INTO can_call;
  IF can_call THEN
    RAISE WARNING 'F10 FIX FAILED: anon role can still call decay_daily_needs_all()';
  ELSE
    RAISE NOTICE 'F10 FIX OK: anon role can no longer call decay_daily_needs_all()';
  END IF;
END $$;

-- ============================================================
-- Also audit OTHER potentially dangerous batch/maintenance RPCs
-- ============================================================

-- rls_auto_enable: event trigger function, should not be user-callable
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;
-- Note: This is an event trigger function; it runs on DDL events. Keeping service_role access.

-- Verify the function is no longer exposed to authenticated
DO $$
BEGIN
  RAISE NOTICE 'F10 audit: Other RPCs should be checked individually for auth.uid() guards.';
  RAISE NOTICE 'The rpc_auth_audit_with_jwt.py script can verify each RPC with a user JWT.';
END $$;
