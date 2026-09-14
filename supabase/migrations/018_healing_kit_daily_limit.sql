-- ============================================================
-- 018_healing_kit_daily_limit.sql — BUG-219: Healing Kit 每日使用限制
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 添加 last_healing_kit_at 列，记录用户最后一次使用 Healing Kit 的时间
-- 客户端根据此时间判断今日是否已使用（按美国东部时间午夜重置）
alter table public.buddy_state
    add column if not exists last_healing_kit_at timestamptz;

-- 为已有行设置默认值为 NULL（未使用过）
-- 新行默认也是 NULL（不加 default，表示未使用过）
