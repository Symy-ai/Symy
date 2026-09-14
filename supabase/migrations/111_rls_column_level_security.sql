-- ============================================================
-- 111: RLS column-level security — revoke UPDATE on sensitive columns (P0-16, P0-17, HIGH-18, HIGH-19)
-- ============================================================
-- 🔧 2026-07-15 (ARCH-16 #1-5 修复)
--
-- Bug: RLS policies only check auth.uid() = user_id, allowing users to directly
--   UPDATE any column on their own row via PostgREST (browser console).
--   - profiles: can set plan='premium' to bypass payment
--   - buddy_state: can set total_saved=$1B, badges=[...], growth_stage='elder', etc.
--   - refund_requests: can set status='confirmed' to forge refund
--   - email_receipts: can set status='refunded' to trigger refund_boost
--   - invitations: can insert arbitrary referrer_user_id + reward_amount
--
-- Fix: Revoke UPDATE on sensitive columns from authenticated role.
--   Only allow UPDATE via API routes (service_role) or SECURITY DEFINER RPCs.
--   Keep UPDATE on "safe" columns that the client timer legitimately needs.
--
-- Note: API route /api/buddy/state PUT uses createAuthenticatedClient (subject to RLS).
--   After this migration, PUT will only succeed for safe columns.
--   Sensitive columns are already stripped from PUT body (Phase 1 fix).
-- ============================================================

-- ============================================================
-- 1. profiles — revoke UPDATE on `plan` (prevent premium bypass)
-- ============================================================
-- Current: authenticated can UPDATE all columns on own profile
-- Fix: only allow UPDATE on safe columns (display_name, avatar_url, etc.)
-- Revoke UPDATE on: plan (server-only), email (auth.users managed), created_at (immutable)
--
-- 🔧 2026-07-15 fix: Use DO block to GRANT only on columns that actually exist.
--   Previous version hard-coded last_reflection_at which doesn't exist in production DB.

REVOKE UPDATE ON public.profiles FROM authenticated;

DO $$
DECLARE
  safe_cols text[] := ARRAY[
    'display_name', 'avatar_url', 'hourly_rate', 'locale',
    'onboarding_completed', 'last_ritual_at', 'last_reflection_at',
    'timezone', 'avg_amount', 'updated_at'
  ];
  existing_cols text[] := ARRAY(
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
  );
  grant_cols text[];
  col text;
BEGIN
  FOREACH col IN ARRAY safe_cols LOOP
    IF col = ANY(existing_cols) THEN
      grant_cols := array_append(grant_cols, col);
    END IF;
  END LOOP;

  IF array_length(grant_cols, 1) > 0 THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated',
      array_to_string(grant_cols, ', '));
    RAISE NOTICE 'Granted UPDATE on profiles columns: %', array_to_string(grant_cols, ', ');
  ELSE
    RAISE NOTICE 'No safe columns found on profiles — skipping GRANT';
  END IF;
END;
$$;

COMMENT ON TABLE public.profiles IS '2026-07-15 (P0-16): Column-level UPDATE restriction — plan/email/created_at are server-only, not directly updatable by authenticated role.';

-- ============================================================
-- 2. buddy_state — revoke UPDATE on sensitive economy columns (HIGH-18)
-- ============================================================
-- Safe columns (client timer drain/bonus needs): vitality, tokens, health, level, xp, xp_to_next, streak, last_drain_at, updated_at, version
-- Sensitive columns (server-only via RPCs): badges, total_saved, challenges_completed, last_healing_kit_at, growth_stage, personality, intimacy, daily_needs, proactive_messages, personality_awakened_at, last_active_at, daily_see_it_count, daily_see_it_date
--
-- 🔧 2026-07-15 fix: Use DO block to GRANT only on columns that actually exist.

REVOKE UPDATE ON public.buddy_state FROM authenticated;

DO $$
DECLARE
  safe_cols text[] := ARRAY[
    'vitality', 'tokens', 'health', 'level', 'xp', 'xp_to_next',
    'streak', 'last_drain_at', 'updated_at', 'version'
  ];
  existing_cols text[] := ARRAY(
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'buddy_state'
  );
  grant_cols text[];
  col text;
BEGIN
  FOREACH col IN ARRAY safe_cols LOOP
    IF col = ANY(existing_cols) THEN
      grant_cols := array_append(grant_cols, col);
    END IF;
  END LOOP;

  IF array_length(grant_cols, 1) > 0 THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.buddy_state TO authenticated',
      array_to_string(grant_cols, ', '));
    RAISE NOTICE 'Granted UPDATE on buddy_state columns: %', array_to_string(grant_cols, ', ');
  ELSE
    RAISE NOTICE 'No safe columns found on buddy_state — skipping GRANT';
  END IF;
END;
$$;

COMMENT ON TABLE public.buddy_state IS '2026-07-15 (HIGH-18): Column-level UPDATE restriction — economy fields (badges, total_saved, challenges_completed, last_healing_kit_at, growth_stage, personality, intimacy, daily_needs, proactive_messages, etc.) are server-only via SECURITY DEFINER RPCs.';

-- ============================================================
-- 3. refund_requests — revoke UPDATE on `status` (prevent refund forging, HIGH-19)
-- ============================================================
-- 🔧 2026-07-15 fix: Use DO block to GRANT only on columns that actually exist.

REVOKE UPDATE ON public.refund_requests FROM authenticated;

DO $$
DECLARE
  safe_cols text[] := ARRAY['description', 'updated_at', 'notes'];
  existing_cols text[] := ARRAY(
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'refund_requests'
  );
  grant_cols text[];
  col text;
BEGIN
  FOREACH col IN ARRAY safe_cols LOOP
    IF col = ANY(existing_cols) THEN
      grant_cols := array_append(grant_cols, col);
    END IF;
  END LOOP;

  IF array_length(grant_cols, 1) > 0 THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.refund_requests TO authenticated',
      array_to_string(grant_cols, ', '));
    RAISE NOTICE 'Granted UPDATE on refund_requests columns: %', array_to_string(grant_cols, ', ');
  ELSE
    RAISE NOTICE 'No safe columns found on refund_requests — skipping GRANT';
  END IF;
END;
$$;

COMMENT ON TABLE public.refund_requests IS '2026-07-15 (HIGH-19): Column-level UPDATE restriction — status is server-only (admin/webhook), not directly updatable by authenticated role.';

-- ============================================================
-- 4. email_receipts — revoke UPDATE on `status` (prevent refund_boost forging, HIGH-19)
-- ============================================================
REVOKE UPDATE ON public.email_receipts FROM authenticated;
-- No columns are user-updatable (all server-managed)
-- (SELECT is still allowed via RLS policy)

COMMENT ON TABLE public.email_receipts IS '2026-07-15 (HIGH-19): Column-level UPDATE restriction — status and all fields are server-only (IMAP scan / admin), authenticated role has SELECT only.';

-- ============================================================
-- 5. invitations — revoke INSERT (prevent arbitrary referrer, P0-17)
-- ============================================================
-- Current: authenticated can INSERT with arbitrary referrer_user_id + reward_amount
-- Fix: Revoke INSERT — invitations are created server-side only (via /api/invite/record-ref)
REVOKE INSERT ON public.invitations FROM authenticated;
-- Keep SELECT (users can view their own invitations via RLS)
-- Keep UPDATE (for status changes via RLS WITH CHECK)

COMMENT ON TABLE public.invitations IS '2026-07-15 (P0-17): INSERT revoked from authenticated — invitations are server-only (created via /api/invite/record-ref with server-validated referrer_user_id).';

-- ============================================================
-- 6. active_challenges — deferred (status transitions need authenticated UPDATE)
-- ============================================================
-- NOTE: challenge-store.ts uses authenticated client to UPDATE status (active→expired, expired→active).
-- Revoking UPDATE on status would break these legitimate flows.
-- Future fix: move all status transitions to SECURITY DEFINER RPCs, then revoke.
-- For now, the CAS check (eq('status', 'active')) in challenge-store.ts prevents most abuse.
-- Direct PostgREST UPDATE of status='passed' gives no rewards (rewards are in the RPC).

-- ============================================================
-- Verification queries (run manually to confirm)
-- ============================================================
-- Check column-level grants:
-- SELECT grantee, table_name, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public'
--   AND grantee = 'authenticated'
--   AND table_name IN ('profiles', 'buddy_state', 'refund_requests', 'email_receipts', 'active_challenges')
-- ORDER BY table_name, column_name;
