-- 117: Add is_example column to butterfly_sessions
-- 🔧 2026-07-15: 标记盲盒数据来源 — example chips (is_example=true) vs 用户自己输入 (is_example=false)
-- 用户自己输入的数据被视为"大概率真实执行了的消费行为"，用于盲区地图和AI个性化

ALTER TABLE butterfly_sessions
ADD COLUMN IF NOT EXISTS is_example BOOLEAN NOT NULL DEFAULT false;

-- 给已有数据回填 (所有旧数据默认 false — 保守处理，不假设旧数据是 example)
-- 注意: 不回填为 true，因为旧数据可能混合了 example 和真实输入

COMMENT ON COLUMN butterfly_sessions.is_example IS 'true = 来自示例数据 (非真实消费), false = 用户自己输入 (大概率真实消费行为)';
