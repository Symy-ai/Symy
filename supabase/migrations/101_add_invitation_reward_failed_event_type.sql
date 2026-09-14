-- ============================================================
-- 101: Add 'invitation_reward_failed' to health_events.event_type CHECK constraint
-- ============================================================
-- Round 120 audit fix (AUDIT-2 P0 #2):
-- 旧代码 invitation-reward.ts:200-205 — referrer 奖励失败时只 log + 注释 "manual reconciliation needed"
-- 但没有任何 DB 记录 → ops 永远发现不了 → referrer 永远拿不到奖励
--
-- 修复: 写一条 health_events 记录, type='invitation_reward_failed', metadata 含 referrerUserId + token amount + badge
-- 未来可用 admin API 或定时任务扫描此 event_type, 重试 referrer 奖励
--
-- ⚠️ 已检查 ls supabase/migrations/ | sort | tail -1 = 100, 此文件用 101 (不跳号, 不重复)
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
      'manual_adjustment',
      'butterfly_completed',
      'butterfly_chapter_viewed',
      'invitation_reward_failed'
    )
  );

COMMENT ON CONSTRAINT health_events_event_type_check ON public.health_events IS 'Round 120 audit fix: add invitation_reward_failed (AUDIT-2 P0 #2 — referrer reward retry audit trail)';
