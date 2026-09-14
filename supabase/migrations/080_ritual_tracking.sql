-- ============================================================
-- 080_ritual_tracking.sql — 每日照见仪式追踪
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 在 profiles 表添加 last_ritual_at 字段
-- 记录用户最后一次看到每日仪式的时间戳
-- 用于跨设备同步: 用户在设备 A 看过仪式后, 设备 B 不会重复显示
alter table public.profiles
    add column if not exists last_ritual_at timestamptz;

-- 用户可以更新自己的 last_ritual_at (已有 update policy 覆盖)
