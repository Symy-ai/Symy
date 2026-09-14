-- ============================================================
-- 102: Add new trigger_source values for Round 120 audit audit-trails
-- ============================================================
-- Round 120 audit fix (AUDIT-6 P0 #2):
-- invitation-reward.ts 和 dream-funds/route.ts 写 health_events 审计记录时
-- 用了 'invitation_reward_retry' 和 'dream_fund_redistribute_failed' 作为 trigger_source
-- 但 migration 083 的 CHECK 约束只允许 9 个值 → INSERT 失败 (check_violation)
-- 后果: 审计记录静默丢失 (catch 块只 log, 用户看不到)
--
-- 修复: 扩展 CHECK 约束, 加入新的 trigger_source 值
--
-- ⚠️ 已检查 ls supabase/migrations/ | sort | tail -1 = 101, 此文件用 102 (不跳号)
-- ============================================================

ALTER TABLE public.health_events
  DROP CONSTRAINT IF EXISTS health_events_trigger_source_check;

ALTER TABLE public.health_events
  ADD CONSTRAINT health_events_trigger_source_check CHECK (
    trigger_source IN (
      'email_receipt',
      'email_refund',
      'email_ignore',
      'chat_mcp',
      'passive_daily',
      'token_drain',
      'revive_deposit',
      'manual',
      'deposit_api',
      -- 🔧 Round 120 新增: 审计/重试相关的 trigger_source
      'invitation_reward_retry',       -- 邀请奖励 referrer 失败, 待重试 (invitation-reward.ts)
      'dream_fund_redistribute_failed' -- dream fund 删除时金额重分配失败 (dream-funds/route.ts)
    )
  );

COMMENT ON CONSTRAINT health_events_trigger_source_check ON public.health_events IS 'Round 120 audit fix: add invitation_reward_retry + dream_fund_redistribute_failed (AUDIT-6 P0 #2 — audit trail INSERTs were failing silently)';
