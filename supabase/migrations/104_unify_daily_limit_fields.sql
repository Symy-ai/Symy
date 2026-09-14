-- ============================================================
-- 104: Unify daily limit fields — merge challenge_count/date + gacha_pulls_count/date
-- ============================================================
-- Round 126 用户决策 3: 合并为单一 daily_see_it_count / daily_see_it_date
--
-- 背景:
-- 同一个概念 "每日 See-it 限制" 用了两套字段:
-- - challenge_count / challenge_date (chat route + challenge create/limit)
-- - gacha_pulls_count / gacha_pulls_date (gacha-limit route + butterfly session)
--
-- 合并后: See-it 挑战和 Gacha 抽卡共享同一个每日配额 (3次/天)
--
-- ⚠️ 此 migration 不可逆
-- ⚠️ 执行前确保所有代码已改为用 daily_see_it_count / daily_see_it_date
-- ============================================================

-- Step 1: Rename challenge_count → daily_see_it_count
ALTER TABLE public.buddy_state RENAME COLUMN challenge_count TO daily_see_it_count;

-- Step 2: Rename challenge_date → daily_see_it_date
ALTER TABLE public.buddy_state RENAME COLUMN challenge_date TO daily_see_it_date;

-- Step 3: Drop gacha_pulls_count (data merged into daily_see_it_count)
-- 取两者最大值 (防止单方有数据另一方为 0)
UPDATE public.buddy_state
  SET daily_see_it_count = GREATEST(daily_see_it_count, COALESCE(gacha_pulls_count, 0))
  WHERE gacha_pulls_count IS NOT NULL AND gacha_pulls_count > daily_see_it_count;

UPDATE public.buddy_state
  SET daily_see_it_date = gacha_pulls_date
  WHERE gacha_pulls_date IS NOT NULL
    AND (daily_see_it_date IS NULL OR gacha_pulls_date > daily_see_it_date);

ALTER TABLE public.buddy_state DROP COLUMN IF EXISTS gacha_pulls_count;
ALTER TABLE public.buddy_state DROP COLUMN IF EXISTS gacha_pulls_date;

-- Step 4: Drop old constraints/indexes that reference the old column names
-- (PostgreSQL auto-renames constraints, but indexes may need manual cleanup)
DROP INDEX IF EXISTS idx_buddy_state_challenge_count;
DROP INDEX IF EXISTS idx_buddy_state_gacha_pulls_count;

COMMENT ON COLUMN public.buddy_state.daily_see_it_count IS 'Round 126: unified daily See-it + Gacha limit count (was challenge_count + gacha_pulls_count)';
COMMENT ON COLUMN public.buddy_state.daily_see_it_date IS 'Round 126: unified daily See-it + Gacha limit date (was challenge_date + gacha_pulls_date)';
