-- 🔧 需求六: 免费版挑战每日 3 次限制 (服务端追踪, 跨设备同步)
--    镜像 gacha_pulls_count/gacha_pulls_date 模式 (migration 078)
--    逻辑: 每次创建挑战 → challenge_count + 1; 每日 4:00 AM 重置 (date 字段变化时 count 清零)
--    Premium 用户不限次 (plan = 'premium' 时跳过检查)

-- 1. 加 challenge_count 列 (默认 0)
ALTER TABLE buddy_state
  ADD COLUMN IF NOT EXISTS challenge_count integer NOT NULL DEFAULT 0;

-- 2. 加 challenge_date 列 (记录当前 count 对应的日期, YYYY-MM-DD 格式)
ALTER TABLE buddy_state
  ADD COLUMN IF NOT EXISTS challenge_date text;

-- 3. 加注释
COMMENT ON COLUMN buddy_state.challenge_count IS '🔧 需求六: Free 用户每日挑战次数 (4:00 AM 重置, max 3/day; Premium 不限)';
COMMENT ON COLUMN buddy_state.challenge_date IS '🔧 需求六: Date string (YYYY-MM-DD) when challenge_count was last updated. When date changes, count resets to 0';
