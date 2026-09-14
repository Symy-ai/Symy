-- Migration 036: profiles 表加 locale 字段
-- 用于后端 MCP handler 生成对应语言的 health_event description

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en';

-- 回填：从 user_metadata 的 locale 同步到 profiles
-- （需要通过 API 触发，SQL 无法直接读 auth.users.user_metadata）
