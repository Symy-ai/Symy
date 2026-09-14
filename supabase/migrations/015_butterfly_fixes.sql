-- ============================================================
-- 015_butterfly_fixes.sql
-- 蝴蝶效应系统 — 代码审查修复
-- ============================================================

-- C3 fix: 每个用户只能有一个 active 会话（partial unique index）
CREATE UNIQUE INDEX IF NOT EXISTS idx_butterfly_one_active_session
  ON butterfly_sessions(user_id)
  WHERE status = 'active';

-- H10 fix: outline 默认值从 '{}' 改为 NULL（空对象不是有效的 StoryOutline）
-- 注意：需要先把已有 '{}' 的行改为 NULL
UPDATE butterfly_sessions SET outline = NULL WHERE outline = '{}'::jsonb;
ALTER TABLE butterfly_sessions ALTER COLUMN outline DROP NOT NULL;
ALTER TABLE butterfly_sessions ALTER COLUMN outline DROP DEFAULT;

-- M11 fix: 移除冗余索引（user_status 索引已覆盖 user_id 查询）
DROP INDEX IF EXISTS idx_butterfly_sessions_user_id;

-- M12 fix: 添加 amount 非负约束
ALTER TABLE butterfly_sessions ADD CONSTRAINT chk_amount_non_negative
  CHECK (amount IS NULL OR amount >= 0);
