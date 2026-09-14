-- ============================================================
-- Fix: Add WITH CHECK to UPDATE policies (prevent user_id tampering)
-- Security: Without WITH CHECK, users could UPDATE their row to
--   change user_id to someone else's, enabling impersonation.
-- Affects: inward_why_wall, inward_daily_reflection (from migration 128)
-- ============================================================

-- 1. inward_why_wall: drop and recreate UPDATE policy with WITH CHECK
DROP POLICY IF EXISTS "why_wall_update_own" ON public.inward_why_wall;
CREATE POLICY "why_wall_update_own" ON public.inward_why_wall
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. inward_daily_reflection: drop and recreate UPDATE policy with WITH CHECK
DROP POLICY IF EXISTS "reflection_update_own" ON public.inward_daily_reflection;
CREATE POLICY "reflection_update_own" ON public.inward_daily_reflection
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
