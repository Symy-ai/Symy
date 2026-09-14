-- ============================================================
-- 103: Drop dream_funds JSONB column from buddy_state
-- ============================================================
-- Round 126 用户决策: 删除 buddy_state.dream_funds JSONB 缓存列
--
-- 背景:
-- dream_funds 数据同时存在两处:
-- 1. dream_funds 独立表 (migration 023, source of truth)
-- 2. buddy_state.dream_funds JSONB (denormalized cache)
--
-- 4 个 migration (061/063/067/069) 试图修复 drift, 但根因是两个数据源存在。
-- Round 120 已禁止 PUT /api/buddy/state 写 dream_funds JSONB。
-- 现在彻底删除该列, 消除所有 drift 可能性。
--
-- 影响:
-- - GET /api/buddy/state 不再返回 dream_funds JSONB (代码已改为从 dream_funds 表读)
-- - dream-funds CRUD 不再调 syncToBuddyStateCache (代码将移除)
-- - buddy_state.dream_funds JSONB 列不存在, 所有引用该列的代码需更新
--
-- ⚠️ 此 migration 不可逆 (DROP COLUMN)
-- ⚠️ 执行前确保所有代码已改为从 dream_funds 表读
-- ============================================================

-- Step 1: Drop the JSONB column
ALTER TABLE public.buddy_state DROP COLUMN IF EXISTS dream_funds;

COMMENT ON TABLE public.buddy_state IS 'Round 126: dropped dream_funds JSONB column — dream_funds table is now the sole source of truth';
