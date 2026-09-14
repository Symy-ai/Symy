-- ============================================================
-- 116: active_challenges RLS + ALTER DEFAULT PRIVILEGES (ARCH-16 #6/#10)
-- ============================================================
-- 🔧 2026-07-15 (ARCH-16 #6/#10 修复)
--
-- Bug 1 (#6): active_challenges RLS allows user to flip status to 'passed'
--   → fake challenge completion (though rewards only come from RPC)
--   → still allows UI confusion + metadata manipulation
--   Fix: REVOKE UPDATE on status, amount, challenge_type, user_id, created_at
--   Allow UPDATE only on: deposit_status, deposited_at, metadata, updated_at
--
-- Bug 2 (#10): No ALTER DEFAULT PRIVILEGES
--   → new tables get Supabase defaults (ALL privileges to anon/authenticated)
--   → security risk: new tables are world-readable/writable by default
--   Fix: ALTER DEFAULT PRIVILEGES REVOKE excessive permissions
-- ============================================================

-- ============================================================
-- 1. active_challenges — column-level UPDATE restriction
-- ============================================================

REVOKE UPDATE ON public.active_challenges FROM authenticated;

DO $$
DECLARE
  safe_cols text[] := ARRAY['deposit_status', 'deposited_at', 'metadata', 'updated_at'];
  existing_cols text[] := ARRAY(
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'active_challenges'
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
    EXECUTE format('GRANT UPDATE (%s) ON public.active_challenges TO authenticated',
      array_to_string(grant_cols, ', '));
    RAISE NOTICE 'Granted UPDATE on active_challenges columns: %', array_to_string(grant_cols, ', ');
  END IF;
END;
$$;

COMMENT ON TABLE public.active_challenges IS '2026-07-15 (ARCH-16 #6): Column-level UPDATE — status/amount/user_id are server-only (RPC), authenticated can only update deposit_status + metadata';

-- ============================================================
-- 2. ALTER DEFAULT PRIVILEGES — lock down new tables
-- ============================================================
-- Supabase default: new tables get ALL privileges for anon + authenticated
-- We want: new tables require explicit GRANT (principle of least privilege)

-- Revoke default INSERT/UPDATE/DELETE from anon on new tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM anon;

-- Revoke default INSERT/UPDATE/DELETE from authenticated on new tables
-- (forces developers to explicitly GRANT what's needed)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE ON TABLES FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM authenticated;

-- Keep default SELECT for authenticated (read access is generally safe)
-- and all privileges for service_role (server-side code)

COMMENT ON SCHEMA public IS '2026-07-15 (ARCH-16 #10): ALTER DEFAULT PRIVILEGES — new tables require explicit INSERT/UPDATE/DELETE grants (principle of least privilege)';
