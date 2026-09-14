-- ============================================================
-- 029: Add 'challenge_completed' to health_events.event_type CHECK constraint
-- ============================================================
-- 问题：BUG-326 修复把 complete_challenge.ts 的 eventType 从 'challenge_reward'
-- 改成 'challenge_completed'（让 cultivation.ts fetchMonthlyMetrics 能匹配到），
-- 但 006_health_events.sql 的 CHECK 约束只允许这些值：
--   impulse_damage, impulse_confessed, mindful_recovery, refund_boost,
--   challenge_reward, passive_recovery, drain, revive, manual_adjustment
-- → createHealthEvent 调用插入 'challenge_completed' 时违反 CHECK 约束失败
-- → Health Log 永远为空
--
-- 修复：DROP 旧约束 + ADD 新约束（加上 'challenge_completed'）
-- ============================================================

ALTER TABLE public.health_events
  DROP CONSTRAINT IF EXISTS health_events_event_type_check;

ALTER TABLE public.health_events
  ADD CONSTRAINT health_events_event_type_check CHECK (
    event_type IN (
      'impulse_damage',
      'impulse_confessed',
      'mindful_recovery',
      'refund_boost',
      'challenge_reward',
      'challenge_completed',
      'passive_recovery',
      'drain',
      'revive',
      'manual_adjustment'
    )
  );

COMMENT ON CONSTRAINT health_events_event_type_check ON public.health_events IS 'P0 fix: add challenge_completed (BUG-326 eventType rename)';
