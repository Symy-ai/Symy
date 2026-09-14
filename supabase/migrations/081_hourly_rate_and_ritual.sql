-- ============================================================
-- 081_hourly_rate.sql — 用户时薪设置 (金钱↔生命时间换算)
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 在 profiles 表添加 hourly_rate 字段
-- 默认 $20/hour (US median take-home pay)
-- 用户可在 Profile 页面设置, 作为全局 Freedom Translation 计算依据
alter table public.profiles
    add column if not exists hourly_rate numeric not null default 20;

-- 同时添加 last_ritual_at 字段 (用于每日照见仪式跨设备同步)
-- 之前的 migration 054 没有被执行, 合并到这里
alter table public.profiles
    add column if not exists last_ritual_at timestamptz;

-- 用户可以更新自己的 hourly_rate 和 last_ritual_at (已有 update policy 覆盖)
