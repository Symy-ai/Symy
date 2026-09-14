-- ============================================================
-- 076_savings_fund_max_target.sql
-- Savings 基金 target 从 1000000 改为 INTEGER 最大值 (2147483647)
-- ============================================================
-- 原因: 用户要求储蓄基金"能多大就多大"。
--   旧值 1000000 ($1M) 对富豪用户可能不够 (虽然 UI 显示 ∞, 但 DB 有上限)。
--   新值 2147483647 (PostgreSQL INTEGER 最大值, 约 21 亿) 足够大,
--   正常用户永远存不到, 实际等同于"无限"。
-- ============================================================

-- 1. 放宽 CHECK 约束: target <= 1000000 → target <= 2147483647
ALTER TABLE public.dream_funds DROP CONSTRAINT IF EXISTS dream_funds_target_check;
ALTER TABLE public.dream_funds ADD CONSTRAINT dream_funds_target_check
  CHECK (target > 0 AND target <= 2147483647);

-- 2. 更新现有 Savings 基金的 target
UPDATE public.dream_funds
SET target = 2147483647, updated_at = now()
WHERE fund_id = 'df-savings' AND target = 1000000;

-- 3. 更新 buddy_state.dream_funds JSONB 中的 Savings target
UPDATE public.buddy_state
SET dream_funds = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'id' = 'df-savings'
      THEN jsonb_set(elem, '{target}', '2147483647'::jsonb)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(dream_funds) AS elem
)
WHERE dream_funds @> '[{"id":"df-savings","target":1000000}]'::jsonb;

-- 4. 更新 column default (新用户的 buddy_state.dream_funds 默认值)
ALTER TABLE public.buddy_state ALTER COLUMN dream_funds SET DEFAULT
  '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"},{"id":"df-savings","name":"Savings","target":2147483647,"current":0,"emoji":"🏦"}]'::jsonb;

COMMENT ON TABLE public.dream_funds IS '075: Savings 基金 target 改为 INTEGER 最大值 (2147483647), CHECK 约束同步放宽';
