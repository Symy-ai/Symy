-- ============================================================
-- 107: Seed default dream funds for new users — fix missing Savings fund
-- ============================================================
-- Bug: 新用户注册后梦想基金为空 — dream_funds 表无初始数据
--   dream_funds 表是 source of truth (migration 103 删除了 buddy_state.dream_funds JSONB)
--   handle_new_buddy_state() 只插入 buddy_state, 不插入 dream_funds
--   → 新用户 GET /api/buddy/state 返回空 dreamFunds 数组
--   → 前端 fallback 到 DEFAULT_DREAM_FUNDS (仅内存), DB 无数据
--   → 用户刷新或重新登录后, dreamFunds 仍为空
--
-- 修复: 在 handle_new_user() trigger 中插入默认 dream_funds 行
--   (包含 Savings 无上限基金)
-- ============================================================

-- 重建 handle_new_user — 同时创建 profiles + 默认 dream_funds
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. 创建 profile
    BEGIN
        INSERT INTO public.profiles (id, email, display_name, avatar_url)
        VALUES (
            new.id,
            new.email,
            COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
            new.raw_user_meta_data->>'avatar_url'
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: profiles INSERT failed for user %: %', new.id, SQLERRM;
    END;

    -- 2. 创建默认 dream funds (含 Savings 无上限基金)
    BEGIN
        INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
        VALUES
            (new.id, 'df-1', 'Credit Card Payoff', 2000, 0, '💳', 0),
            (new.id, 'df-2', 'Iceland Trip', 5000, 0, '🏔️', 1),
            (new.id, 'df-savings', 'Savings', 2147483647, 0, '🏦', 2)
        ON CONFLICT (user_id, fund_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'handle_new_user: dream_funds INSERT failed for user %: %', new.id, SQLERRM;
    END;

    RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'Round 128: Rebuilt — creates profiles + default dream_funds (incl. Savings) with EXCEPTION handling';

-- ============================================================
-- Backfill: 为现有没有 dream_funds 的用户补建默认基金
-- ============================================================

-- 找到所有没有 dream_funds 的用户, 插入默认 3 个基金
INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
SELECT p.id, 'df-1', 'Credit Card Payoff', 2000, 0, '💳', 0
FROM public.profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM public.dream_funds df WHERE df.user_id = p.id AND df.fund_id = 'df-1'
)
ON CONFLICT (user_id, fund_id) DO NOTHING;

INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
SELECT p.id, 'df-2', 'Iceland Trip', 5000, 0, '🏔️', 1
FROM public.profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM public.dream_funds df WHERE df.user_id = p.id AND df.fund_id = 'df-2'
)
ON CONFLICT (user_id, fund_id) DO NOTHING;

INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
SELECT p.id, 'df-savings', 'Savings', 2147483647, 0, '🏦', 2
FROM public.profiles p
WHERE NOT EXISTS (
    SELECT 1 FROM public.dream_funds df WHERE df.user_id = p.id AND df.fund_id = 'df-savings'
)
ON CONFLICT (user_id, fund_id) DO NOTHING;
