-- ============================================================
-- 118_butterfly_sessions_add_considering_and_bookmark.sql
-- 蝴蝶效应系统升级 — 新增 'considering' 决策类型 + 收藏功能
-- ============================================================
--
-- 背景:
--   用户报告 + 用户报告 V2 优化建议:
--   1. 当前 Gacha 只支持 'bought' / 'resisted' (已买/已克制) — 缺少"考虑中"场景
--      用户希望在购买前生成两个平行宇宙故事 (买了 vs 没买) 帮助决策
--   2. 故事无法收藏或分享 — 用户希望能保存有用的故事以后再看
--
-- 修改:
--   1. 扩展 decision_type CHECK 约束: 加 'considering' 类型
--   2. 加 is_bookmarked BOOLEAN 字段 (默认 false)
--
-- 兼容性:
--   - 现有 'bought' / 'resisted' 数据不受影响
--   - is_bookmarked 默认 false, 现有会话自动为未收藏
--   - 前端代码已 backward compatible (未传 is_bookmarked 时默认 false)
-- ============================================================

-- 1. 扩展 decision_type CHECK 约束 (加 'considering')
--    PostgreSQL 不能直接修改 CHECK 约束, 需要 DROP + ADD
ALTER TABLE butterfly_sessions DROP CONSTRAINT IF EXISTS butterfly_sessions_decision_type_check;
ALTER TABLE butterfly_sessions ADD CONSTRAINT butterfly_sessions_decision_type_check
  CHECK (decision_type IN ('bought', 'resisted', 'considering'));

-- 2. 加 is_bookmarked 字段
ALTER TABLE butterfly_sessions ADD COLUMN IF NOT EXISTS is_bookmarked BOOLEAN NOT NULL DEFAULT false;

-- 3. 加索引方便查询"已收藏"列表
CREATE INDEX IF NOT EXISTS idx_butterfly_sessions_bookmarked
  ON butterfly_sessions(user_id, is_bookmarked) WHERE is_bookmarked = true;

-- 4. updated_at 触发器已存在 (014_butterfly_sessions.sql), 无需重复创建

-- 5. 注释
COMMENT ON COLUMN butterfly_sessions.is_bookmarked IS '2026-07-17: 用户收藏标记, 用于后续回看. 默认 false.';
COMMENT ON COLUMN butterfly_sessions.decision_type IS '2026-07-17: 扩展为 bought/resisted/considering. considering = 购买前的双宇宙模拟 (生成买/不买两个未来).';
