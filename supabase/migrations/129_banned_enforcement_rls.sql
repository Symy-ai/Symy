-- ============================================================
-- 129_banned_enforcement_rls.sql — Enforce banned users via RLS
--
-- migration 127_profiles_banned.sql added the banned/banned_until/banned_reason
-- columns but nothing prevented banned users from using the app. This migration
-- folds the banned check into the existing profiles policies so a banned user
-- can no longer read or write their own profile — every user-scoped query the
-- app makes against profiles fails, so the app is effectively unusable for them.
--
-- Why modify existing policies instead of adding new ones:
--   RLS policies for the same command (SELECT, UPDATE) are combined with OR.
--   A separate "banned users blocked" policy would be OR'd with "Users read own
--   profile", so a banned user would still satisfy the original policy and the
--   block would do nothing. The banned predicate MUST be AND'd inside the
--   existing permissive policies' USING/WITH CHECK clauses to take effect.
--
-- Admin (service_role) bypasses RLS entirely, so /admin/users ban/unban and
-- every other admin operation is unaffected.
-- ============================================================

-- SELECT: banned users cannot read their own profile
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id AND NOT COALESCE(banned, false));

-- UPDATE: banned users cannot write their own profile
-- (recreated from 094_add_with_check_to_update_policies.sql + banned predicate)
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id AND NOT COALESCE(banned, false))
    WITH CHECK (auth.uid() = id AND NOT COALESCE(banned, false));
