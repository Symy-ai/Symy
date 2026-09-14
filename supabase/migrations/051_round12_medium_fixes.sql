-- Migration 051: Round 12 — MEDIUM bugs 根因修复
--
-- 🔧 ARCH fix (Round 12):
-- D1 (HIGH — handle_new_buddy_state trigger 只插 buddy_state JSONB 不插 dream_funds 表):
--    005/047 的 trigger 只 INSERT INTO buddy_state, 不插 dream_funds 表。
--    新用户首次点编辑默认 fund → dream_funds 表 SELECT 返回 null → 404 错误。
--    根因修复: 重建 trigger 同时插 dream_funds 表 (2 行默认)。
--
-- D2 (MEDIUM — 006 文件名冲突):
--    两个 migration 共用 006_ 前缀 (006_health_events.sql + 006_onboarding.sql)。
--    迁移工具切换时可能一个被跳过。重命名 006_onboarding.sql → 051_a_onboarding.sql。
--    (内容不变, 仅文件名改变, 已应用的 006_onboarding 不会被重复执行)
--
-- D3 (LOW — buddy_state dream_funds JSONB fallback 死代码标记):
--    buddy/state GET 在 dream_funds 表查询失败时 fallback 到 JSONB。
--    023 已部署 6+ 月, 该 fallback 是死代码。标记可移除 (代码层在 route.ts)。
--
-- 注: encryptSensitive fail-closed 是应用层改动 (src/lib/crypto-helpers.ts), 不在 migration 内。

-- ============================================================
-- D1: 重建 handle_new_buddy_state trigger — 同时插 dream_funds 表
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_buddy_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 插入 buddy_state (含 dream_funds JSONB 缓存, 向后兼容)
    INSERT INTO public.buddy_state (user_id, dream_funds)
    VALUES (
        new.id,
        '[{"id":"df-1","name":"Credit Card Payoff","target":3000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🇮🇸"}]'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;

    -- 🔧 ARCH fix (Round 12 D1): 同时插 dream_funds 表 (source of truth)
    --    旧代码只插 JSONB, 用户首次编辑 fund 时 dream_funds 表为空 → 404
    INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
    VALUES
        (new.id, 'df-1', 'Credit Card Payoff', 3000, 0, '💳', 0),
        (new.id, 'df-2', 'Iceland Trip', 5000, 0, '🇮🇸', 1)
    ON CONFLICT (user_id, fund_id) DO NOTHING;

    RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_buddy_state IS 'Round 12 D1: 同时插 buddy_state JSONB + dream_funds 表 (修复新用户首次编辑 fund 404)';

-- ============================================================
-- D1b: Backfill — 现有用户的 dream_funds 表若为空但 buddy_state.dream_funds JSONB 有默认值, 回填
--      (023 migration:62-79 已做过一次性 backfill, 但 023 之后注册的新用户仍缺行)
-- ============================================================

INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
SELECT
    bs.user_id,
    'df-1',
    'Credit Card Payoff',
    3000,
    0,
    '💳',
    0
FROM public.buddy_state bs
WHERE NOT EXISTS (
    SELECT 1 FROM public.dream_funds df
    WHERE df.user_id = bs.user_id AND df.fund_id = 'df-1'
)
AND bs.dream_funds @> '[{"id":"df-1"}]'::jsonb
ON CONFLICT (user_id, fund_id) DO NOTHING;

INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
SELECT
    bs.user_id,
    'df-2',
    'Iceland Trip',
    5000,
    0,
    '🇮🇸',
    1
FROM public.buddy_state bs
WHERE NOT EXISTS (
    SELECT 1 FROM public.dream_funds df
    WHERE df.user_id = bs.user_id AND df.fund_id = 'df-2'
)
AND bs.dream_funds @> '[{"id":"df-2"}]'::jsonb
ON CONFLICT (user_id, fund_id) DO NOTHING;

-- ============================================================
-- D2: 006 文件名冲突 — 标记 006_onboarding.sql 为已弃用
--      (实际重命名在文件系统层, 此处仅添加注释说明)
--      注: 006_onboarding.sql 的内容 (ADD COLUMN onboarding_completed) 已被 006_health_events.sql
--      末尾的 DO $$ 块覆盖, 两者都用 ADD COLUMN IF NOT EXISTS, 不会冲突。
--      但文件名冲突让迁移工具混乱, 应重命名。
--      此 migration 不做文件操作, 仅记录决策。
-- ============================================================

COMMENT ON COLUMN public.profiles.onboarding_completed IS 'Round 12 D2: 006_onboarding.sql 文件名冲突已记录, 内容被 006_health_events.sql 覆盖, 列已稳定 6+ 月';

-- ============================================================
-- D3: 标记 buddy/state GET 的 dream_funds JSONB fallback 可移除
-- ============================================================

COMMENT ON COLUMN public.buddy_state.dream_funds IS 'Round 12 D3: JSONB 缓存 (向后兼容), dream_funds 表是 source of truth. GET /api/buddy/state 的 JSONB fallback 死代码可移除';
