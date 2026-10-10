-- Owner TODO: see PENDING-OWNER-DEPLOY.md (audit archive moved to doc/rls-audit-findings.md).
-- Backfill (2026-10-11 R475 勘误): 2026-10-01 审计声称「零 GAP」有误——实际 5 处 UPDATE policy
-- 缺 WITH CHECK (USING-only = 可改 user_id 转移行所有权)。本 migration 从未执行, 修复内联于此,
-- 保证下方守卫跑完 = 零违规。勘误记录: doc/rls-audit-findings.md。
ALTER POLICY butterfly_sessions_update ON butterfly_sessions
  WITH CHECK (auth.uid() = user_id);

ALTER POLICY active_challenges_update_own ON public.active_challenges
  WITH CHECK (auth.uid() = user_id);

ALTER POLICY avatars_update ON storage.objects
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid() = (storage.foldername(name))[1]::uuid
  );

ALTER POLICY "why_wall_update_own" ON public.inward_why_wall
  WITH CHECK (auth.uid() = user_id);

ALTER POLICY "reflection_update_own" ON public.inward_daily_reflection
  WITH CHECK (auth.uid() = user_id);

-- Guard: keep the effective UPDATE policy set aligned with the RLS WITH CHECK rule.
-- (storage.objects 非 public schema, 守卫不覆盖——avatars_update 已在此处修复)
DO $$
DECLARE
  missing record;
BEGIN
  FOR missing IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND cmd = 'UPDATE'
      AND qual IS NOT NULL
      AND with_check IS NULL
  LOOP
    RAISE EXCEPTION 'UPDATE policy lacks WITH CHECK: %.%', missing.tablename, missing.policyname;
  END LOOP;
END $$;
