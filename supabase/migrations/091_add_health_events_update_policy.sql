-- ============================================================
-- 091_add_health_events_update_policy.sql — P0-2 根因修复: 允许用户 UPDATE 自己的 health_events
--
-- 🔧 P0-2 根因修复 (Round 88):
--    旧代码: health_events RLS policy 只有 SELECT + INSERT (migration 006), 没有 UPDATE policy。
--    问题: record_impulse.ts 用 ctx.supabase (user client) UPDATE health_events.description 会被 RLS 静默拒绝
--         (0 rows affected, 无 error) → DB 仍存占位 description → Book of seeing 显示 "→ ?"
--    修复:
--    1. 加 UPDATE policy 允许用户 UPDATE 自己的 health_events (record_impulse.ts 的 UPDATE 生效)
--    2. record_impulse.ts 改用 createAdminClient (service_role) 绕过 RLS (防御性, 不依赖此 migration)
--
--    双重保险: 即便此 migration 未执行, record_impulse.ts 的 admin client 也能 UPDATE。
--    此 migration 让 user client 也能 UPDATE (未来其他场景可能需要)。
-- ============================================================

-- 加 UPDATE policy (用户只能 UPDATE 自己的 health_events)
CREATE POLICY "Users can update their own health events"
  ON public.health_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON POLICY "Users can update their own health events" ON public.health_events IS 'P0-2 fix: 允许用户 UPDATE 自己的 health_events (主要用于 record_impulse 更新 description)';
