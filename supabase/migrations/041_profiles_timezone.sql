-- 041: Add timezone column to profiles
--
-- 🔧 ARCH fix (Round 2 H7 — impulse score uses server-local timezone):
--    旧代码 impulse-score.ts 用 Date.getHours() 返回服务器本地时区小时。
--    Vercel serverless 默认 UTC → 非_utc 用户的 "深夜冲动" 信号完全错误。
--    根因修复: 添加 profiles.timezone 列, 让前端保存用户时区, 后端计算 impulse score 时用。

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- 验证列已添加
DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'timezone'
    ), 'profiles.timezone column was not added';
END $$;

COMMENT ON COLUMN public.profiles.timezone IS
  'Round 2 H7 fix: User IANA timezone (e.g., Asia/Shanghai) for impulse score calculation. Default UTC.';
