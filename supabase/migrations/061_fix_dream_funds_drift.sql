-- 061: Fix dream_funds default target/emoji drift (Round 19 P1)
--
-- 🔧 ARCH fix (Round 17 audit HIGH #9 — dream_funds default target drift):
--    migration 053 的 handle_new_buddy_state trigger 设:
--      df-1: target=3000
--      df-2: emoji=🇮🇸 (Iceland flag)
--    但 src/lib/buddy-defaults.ts (单一来源) 和 migration 011/023 都用:
--      df-1: target=2000
--      df-2: emoji=🏔️ (mountain)
--    后果: 新用户得到 df-1 target=$3000 (DB trigger), 客户端 fallback 显示 $2000 → 不一致 UX
--    根因修复: 重建 trigger 用 buddy-defaults.ts 的值, 并 backfill 已存在的 df-1=3000 行
--    (不回填 df-2 emoji, 因 🇮🇸 vs 🏔️ 是审美差异, 不是数据正确性问题)

-- ============================================================
-- 1. 重建 handle_new_buddy_state trigger (与 060 一致, 但保留 053 D1 的 dream_funds 表 INSERT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_buddy_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 🔧 Round 19 fix: target=2000 (匹配 buddy-defaults.ts), emoji=🏔️ (匹配 buddy-defaults.ts)
    --    Round 12 D1 fix (保留): 同时插 dream_funds 表 (source of truth)
    INSERT INTO public.buddy_state (user_id, dream_funds)
    VALUES (
        new.id,
        '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
    VALUES
        (new.id, 'df-1', 'Credit Card Payoff', 2000, 0, '💳', 0),
        (new.id, 'df-2', 'Iceland Trip', 5000, 0, '🏔️', 1)
    ON CONFLICT (user_id, fund_id) DO NOTHING;

    RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_buddy_state IS
  'Round 19 fix: 与 060 一致 (column defaults 与 buddy-defaults.ts 一致) + Round 12 D1 (同时插 dream_funds 表) + Round 19 #9 (target=2000 / emoji=🏔️ 匹配 buddy-defaults.ts)';

-- ============================================================
-- 2. Backfill: 现有 df-1 target=3000 → 2000 (仅 default fund, 不动用户自定义 fund)
--    条件: fund_id='df-1' AND name='Credit Card Payoff' AND target=3000
--    (排除用户改过名字或 target 的 fund, 只回填未编辑过的 default)
-- ============================================================
UPDATE public.dream_funds
SET target = 2000, updated_at = now()
WHERE fund_id = 'df-1'
  AND name = 'Credit Card Payoff'
  AND target = 3000
  AND current = 0;  -- 未攒过钱的 default fund

-- 同步 buddy_state.dream_funds JSONB
UPDATE public.buddy_state
SET dream_funds = (
  SELECT jsonb_agg(
    CASE WHEN elem->>'id' = 'df-1' AND (elem->>'name') = 'Credit Card Payoff' AND (elem->>'target')::numeric = 3000 AND (elem->>'current')::numeric = 0
      THEN jsonb_set(elem, '{target}', '2000')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(dream_funds) AS arr(elem)
)
WHERE dream_funds @> '[{"id":"df-1","target":3000}]'::jsonb;

-- ============================================================
-- 3. Backfill: df-2 emoji 🇮🇸 → 🏔️ (统一)
-- ============================================================
UPDATE public.dream_funds
SET emoji = '🏔️', updated_at = now()
WHERE fund_id = 'df-2'
  AND name = 'Iceland Trip'
  AND emoji = '🇮🇸';

UPDATE public.buddy_state
SET dream_funds = (
  SELECT jsonb_agg(
    CASE WHEN elem->>'id' = 'df-2' AND (elem->>'name') = 'Iceland Trip' AND (elem->>'emoji') = '🇮🇸'
      THEN jsonb_set(elem, '{emoji}', to_jsonb('🏔️'::text))
      ELSE elem
    END
  )
  FROM jsonb_array_elements(dream_funds) AS arr(elem)
)
WHERE dream_funds @> '[{"id":"df-2","emoji":"🇮🇸"}]'::jsonb;
