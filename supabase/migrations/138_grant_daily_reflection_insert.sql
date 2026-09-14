-- ============================================================
-- Fix: grant INSERT on daily_reflections to authenticated
-- (migration 136 created RLS policies but missed table-level GRANT;
--  Supabase default grants only SELECT on new tables, so every
--  user reflection POST failed with 42501 permission denied)
-- Also grant INSERT on daily_reflection_votes for completeness
-- (verify_resonates RPC path worked, but direct insert grant was
--  equally missing — belt and braces)
-- ============================================================

GRANT SELECT, INSERT ON public.daily_reflections TO authenticated;
GRANT SELECT, INSERT ON public.daily_reflection_votes TO authenticated;

-- Revoke nothing; UPDATE/DELETE stay ungranted (design: rows immutable
-- to users; resonates counter changes only via SECURITY DEFINER RPC).
