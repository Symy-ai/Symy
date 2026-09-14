-- ============================================================
-- 034: pg_cron job to cleanup old non-active challenges
-- ============================================================
-- 每天 3:00 UTC 清理 30 天前的非 active 记录
-- 保留 30 天供审计 + 历史查询
-- active 记录不清理 (由 migration 033 的 30 分钟过期 trigger 处理)
--
-- 前提: Supabase 项目需启用 pg_cron extension
-- ============================================================

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-old-challenges');
    PERFORM cron.schedule(
      'cleanup-old-challenges',
      '0 3 * * *',
      $cron$DELETE FROM public.active_challenges WHERE status != 'active' AND completed_at < NOW() - INTERVAL '30 days'$cron$
    );
    RAISE NOTICE 'pg_cron job created: cleanup-old-challenges (daily 3:00 UTC)';
  ELSE
    RAISE WARNING 'pg_cron extension not enabled. Manual cleanup required.';
  END IF;
END;
$do$;
