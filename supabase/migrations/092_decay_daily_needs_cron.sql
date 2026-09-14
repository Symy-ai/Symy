-- ============================================================
-- 092_decay_daily_needs_cron.sql — P1-5: daily needs 每日衰减 cron
--
-- 🔧 P1-5 机制闭合 (Round 90):
--    decay_daily_needs RPC 定义了但从未被调用 → daily_needs 永远是 100%
--    修复: 创建 batch RPC + pg_cron job 每日凌晨 4 点衰减所有用户
--
--    衰减量: 20 (5 天不补充降到 0)
--    执行时间: 每天凌晨 4:00 UTC (与 healing-kit 重置时间一致)
-- ============================================================

-- 1. 创建 batch 衰减 RPC (遍历所有用户)
create or replace function public.decay_daily_needs_all(p_decay_amount integer default 20)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer := 0;
  v_user record;
begin
  for v_user in select user_id from public.buddy_state loop
    perform public.decay_daily_needs(v_user.user_id, p_decay_amount);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.decay_daily_needs_all(integer) to service_role;

comment on function public.decay_daily_needs_all(integer) is 'P1-5: 批量衰减所有用户的 daily_needs (cron 调用)';

-- 2. 创建 pg_cron job (每天凌晨 4:00 UTC)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 先 unschedule (幂等)
    PERFORM cron.unschedule('decay-daily-needs');
    -- 重新 schedule
    PERFORM cron.schedule(
      'decay-daily-needs',
      '0 4 * * *',  -- 每天凌晨 4:00 UTC
      $cron$SELECT public.decay_daily_needs_all(20)$cron$
    );
    RAISE NOTICE 'pg_cron job created: decay-daily-needs (daily 4:00 UTC, decay 20)';
  ELSE
    RAISE WARNING 'pg_cron extension not enabled. Manual decay required.';
  END IF;
END;
$do$;
