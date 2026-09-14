-- ============================================================
-- 031: Create active_challenges table
-- ============================================================
-- 目的：实现"状态外置"接口设计原则（见 .memory/api-design-principles.md）
--
-- 之前：challengeContext 只在前端 state 和 /api/chat 调用时传递
--   - AI 调 complete_challenge 时必须自己传 challenge_type + saved_amount
--   - AI 偶发传错参数（saved_amount=0, challenge_type 跟 amount 阈值不匹配）
--   - 跨轮对话状态依赖前端，不稳定
--
-- 之后：挑战状态存 DB
--   - 前端发起挑战时 INSERT active_challenges (status='active')
--   - context header 注入 challenge_id
--   - AI 只需传 challenge_id + status ('passed'/'failed')
--   - handler 通过 challenge_id 查表自动取 amount/itemName/tier
--   - 挑战结束 UPDATE status='passed'/'failed'
--
-- 设计要点：
--   1. 每个用户同时只能有一个 active challenge（UNIQUE partial index）
--   2. challenge_type 由 amount 自动计算（trigger），AI 不需要传
--   3. 30 分钟自动过期（trigger 或应用层清理）
-- ============================================================

CREATE TABLE IF NOT EXISTS public.active_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('quick_pass', 'standard', 'boss')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'passed', 'failed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 每个用户同时只能有一个 active challenge
CREATE UNIQUE INDEX IF NOT EXISTS active_challenges_user_active_uniq
  ON public.active_challenges(user_id) WHERE status = 'active';

-- 查询用户最近挑战（不限状态）
CREATE INDEX IF NOT EXISTS active_challenges_user_recent_idx
  ON public.active_challenges(user_id, created_at DESC);

-- ============================================================
-- Trigger: 自动计算 challenge_type based on amount
-- ============================================================
-- amount ≤ 30 → quick_pass
-- 30 < amount ≤ 200 → standard
-- amount > 200 → boss

CREATE OR REPLACE FUNCTION public.calculate_challenge_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.amount <= 30 THEN
    NEW.challenge_type := 'quick_pass';
  ELSIF NEW.amount <= 200 THEN
    NEW.challenge_type := 'standard';
  ELSE
    NEW.challenge_type := 'boss';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_active_challenges_calc_type ON public.active_challenges;

CREATE TRIGGER trg_active_challenges_calc_type
  BEFORE INSERT OR UPDATE OF amount ON public.active_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_challenge_type();

-- ============================================================
-- Trigger: 挑战完成时自动设置 completed_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('passed', 'failed', 'expired') AND OLD.status = 'active' THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_active_challenges_set_completed_at ON public.active_challenges;

CREATE TRIGGER trg_active_challenges_set_completed_at
  BEFORE UPDATE OF status ON public.active_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_completed_at();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.active_challenges ENABLE ROW LEVEL SECURITY;

-- 用户只能看自己的挑战
CREATE POLICY active_challenges_select_own ON public.active_challenges
  FOR SELECT USING (auth.uid() = user_id);

-- 用户只能插入自己的挑战（user_id 必须等于 auth.uid()）
CREATE POLICY active_challenges_insert_own ON public.active_challenges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的挑战
CREATE POLICY active_challenges_update_own ON public.active_challenges
  FOR UPDATE USING (auth.uid() = user_id);

-- 用户只能删除自己的挑战
CREATE POLICY active_challenges_delete_own ON public.active_challenges
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Comments
-- ============================================================

COMMENT ON TABLE public.active_challenges IS 'Active challenges for the challenge mode. Implements 状态外置 principle (see .memory/api-design-principles.md)';
COMMENT ON COLUMN public.active_challenges.challenge_type IS 'Auto-calculated by trigger based on amount: ≤30 quick_pass, 31-200 standard, >200 boss';
COMMENT ON COLUMN public.active_challenges.status IS 'active (ongoing), passed (user resisted), failed (user bought), expired (timeout)';
