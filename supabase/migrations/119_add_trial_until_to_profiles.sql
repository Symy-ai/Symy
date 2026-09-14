-- Migration 119: Add trial_until column to profiles for 7-day VIP trial
-- 新用户注册时自动获得7天VIP试用权限
-- 老用户从migration执行时开始算7天VIP试用

-- 添加 trial_until 字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_until timestamptz;

-- 为所有现有用户设置7天VIP试用 (从现在开始算)
-- 只对 trial_until 为 null 的用户设置 (避免覆盖已设置的)
UPDATE profiles
SET trial_until = NOW() + INTERVAL '7 days'
WHERE trial_until IS NULL;

-- 添加索引用于快速查询试用状态
CREATE INDEX IF NOT EXISTS idx_profiles_trial_until ON profiles (trial_until) WHERE trial_until IS NOT NULL;
