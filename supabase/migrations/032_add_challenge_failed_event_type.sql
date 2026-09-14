-- ============================================================
-- 032: Add 'challenge_failed' to health_events.event_type CHECK constraint
-- ============================================================
-- 问题: complete_challenge 的 failed 模式复用 'impulse_confessed' eventType
--   导致分析双计数 (challenge 状态审计 + 真实冲动消费惩罚都叫 impulse_confessed)
--
-- 修复: 新增 'challenge_failed' eventType, 专门用于 challenge 状态机转换审计
--   - challenge_failed: 挑战标记为 failed (vitality=0, 纯审计)
--   - impulse_confessed: 真实冲动消费 (扣 vitality, 由 record_impulse 创建)
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
      'challenge_failed',
      'passive_recovery',
      'drain',
      'revive',
      'manual_adjustment'
    )
  );

COMMENT ON CONSTRAINT health_events_event_type_check ON public.health_events IS 'P2 fix: add challenge_failed (distinct from impulse_confessed for audit clarity)';
