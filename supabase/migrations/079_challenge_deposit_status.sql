-- ============================================================
-- 079_challenge_deposit_status.sql
-- 添加 deposit_status 列到 active_challenges 表
-- 用于 Dream Fund 信任存入功能：挑战通过后用户选择是否存入 Dream Fund
-- ============================================================

-- 添加 deposit_status 列
ALTER TABLE public.active_challenges
  ADD COLUMN IF NOT EXISTS deposit_status TEXT NOT NULL DEFAULT 'unsettled'
  CHECK (deposit_status IN ('unsettled', 'deposited', 'skipped'));

-- 添加 deposited_at 时间戳
ALTER TABLE public.active_challenges
  ADD COLUMN IF NOT EXISTS deposited_at TIMESTAMPTZ;

-- 索引：快速查找未结算的挑战
CREATE INDEX IF NOT EXISTS idx_active_challenges_deposit_status
  ON public.active_challenges (user_id, deposit_status)
  WHERE deposit_status = 'unsettled' AND status = 'passed';

COMMENT ON TABLE public.active_challenges IS '079: 添加 deposit_status 列 (unsettled/deposited/skipped) + deposited_at';
