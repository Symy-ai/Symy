-- 062: Fix buddy_state schema defaults to match buddy-defaults.ts (Round 19 API-H3)
--
-- 🔧 ARCH fix (Round 21 BUG-R21-C3 — 重命名避免与 056_round13_admin_audit_logs.sql 冲突):
--    旧文件名 056_fix_buddy_state_defaults.sql 与 056_round13_admin_audit_logs.sql 共用 056_ 前缀,
--    Supabase migration 追踪可能混乱。重命名为 062 (内容不变, 生产 DB 已应用过 056_fix 的 ALTER)。
--
-- 🔧 ARCH fix (Round 17 audit H3 — buddy_state schema defaults 不匹配 buddy-defaults.ts):
--    migration 005 定义: level=3, xp=45, streak=7, total_saved=847, challenges_completed=12
--    buddy-defaults.ts:  level=1, xp=0, streak=0, total_saved=0, challenges_completed=0
--    后果: 新用户看到假成就 (level 3, streak 7 天, $847 saved)。
--    根因修复: ALTER COLUMN SET DEFAULT 与 buddy-defaults.ts 一致。
--    注意: 只影响新行 (handle_new_buddy_state trigger 只插 user_id + dream_funds)。
--    已有用户的数据不变 (ALTER DEFAULT 不回填)。
--    注: 此 migration 内容与 060_fix_buddy_state_defaults.sql 重复 (060 还重建了 trigger),
--    保留此文件作为 schema-only fix 的记录 (060 是 trigger + schema, 062 是 schema-only)。

ALTER TABLE public.buddy_state ALTER COLUMN level SET DEFAULT 1;
ALTER TABLE public.buddy_state ALTER COLUMN xp SET DEFAULT 0;
ALTER TABLE public.buddy_state ALTER COLUMN streak SET DEFAULT 0;
ALTER TABLE public.buddy_state ALTER COLUMN total_saved SET DEFAULT 0;
ALTER TABLE public.buddy_state ALTER COLUMN challenges_completed SET DEFAULT 0;

COMMENT ON TABLE public.buddy_state IS 'Round 19 H3 / Round 21 C3: schema defaults aligned with buddy-defaults.ts (level=1, xp=0, streak=0, total_saved=0, challenges_completed=0)';
