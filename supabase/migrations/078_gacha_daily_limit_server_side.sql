-- 🔧 PM-NEW-36 fix: Gacha daily limit 服务端追踪 (跨设备同步)
--    之前: localStorage 追踪 (仅设备级, 用户可切换设备绕过限制)
--    现在: buddy_state 表加 gacha_pulls_count + gacha_pulls_date 字段
--    逻辑: 每次 pull → gacha_pulls_count + 1; 每日 4:00 AM 重置 (date 字段变化时 count 清零)

-- 1. 加 gacha_pulls_count 列 (默认 0)
ALTER TABLE buddy_state
  ADD COLUMN IF NOT EXISTS gacha_pulls_count integer NOT NULL DEFAULT 0;

-- 2. 加 gacha_pulls_date 列 (记录当前 count 对应的日期, YYYY-MM-DD 格式)
ALTER TABLE buddy_state
  ADD COLUMN IF NOT EXISTS gacha_pulls_date text;

-- 3. 加注释
COMMENT ON COLUMN buddy_state.gacha_pulls_count IS '🔧 PM-NEW-36: Gacha daily pull count (resets at 4:00 AM, max 3/day for free users)';
COMMENT ON COLUMN buddy_state.gacha_pulls_date IS '🔧 PM-NEW-36: Date string (YYYY-MM-DD) when gacha_pulls_count was last updated. When date changes, count resets to 0';
