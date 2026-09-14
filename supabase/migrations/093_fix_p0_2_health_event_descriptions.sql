-- ============================================================
-- 090_fix_p0_2_health_event_descriptions.sql — P0-2 根因修复: 清理历史脏数据
--
-- 🔧 P0-2 根因修复 (Round 88):
--    旧代码 record_impulse.ts 在 createHealthEvent 之前生成 description, 硬编码 newVitality=undefined
--    → description 文本里出现 "Symy vitality -8 → ?" 或 "clarity -8 → ?"
--    → Book of seeing 显示 "?"
--
--    虽然 health_events.new_vitality 列存了正确值 (RPC 计算), 但 description 文本未被更新。
--    此 migration 用 new_vitality 列回填 description 中的 "?" 占位符。
--
--    匹配模式: description 含 "→ ?" 且 new_vitality 列有有效值
--    替换: 把 "→ ?" 替换为 "→ {new_vitality}"
--
--    幂等: 只匹配含 "→ ?" 的行, 已修复的行不受影响
-- ============================================================

-- 修复英文 description: "Symy vitality -8 → ?" → "Symy vitality -8 → 64"
UPDATE public.health_events
SET description = REGEXP_REPLACE(
  description,
  '→ \?',
  '→ ' || new_vitality::text,
  'g'
)
WHERE description LIKE '%→ ?%'
  AND new_vitality IS NOT NULL
  AND new_vitality >= 0;

-- 修复中文 description: "清晰度 -8 → ?" → "清晰度 -8 → 64"
-- (REGEXP_REPLACE 已覆盖, 因为中文也用 "→ ?" 符号)
-- 上面一条 UPDATE 已处理所有含 "→ ?" 的行

-- 验证: 查询剩余仍含 "?" 的行 (应该为 0 或仅剩无 new_vitality 的行)
-- SELECT count(*) FROM public.health_events WHERE description LIKE '%→ ?%';

COMMENT ON MIGRATION '090_fix_p0_2_health_event_descriptions' IS 'P0-2 根因修复: 用 new_vitality 列回填 description 中的 "?" 占位符';
