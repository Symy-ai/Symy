-- 073: Fix historical totalSaved drift — one-time data repair (Bug 7 follow-up)
--
-- 🔧 Bug 7 根因修复 follow-up:
--    migration 072 添加了 Savings 溢出基金, 防止 NEW drift (新 challenge 完成后 totalSaved 与
--    sum(dream_funds.current) 一致)。但历史数据中, totalSaved 已经因为 LEAST clamp 而 drift —
--    旧 challenge 完成时 savedAmount 加到 total_saved, 但 dream_fund.current 被 LEAST(target, current+amount)
--    clamp 到 target, 多余部分被吞掉 → total_saved > sum(dream_funds.current) 永久 drift。
--
--    此 migration 是一次性数据修复: 把 total_saved 重置为 sum(dream_funds.current)。
--    修复后, total_saved 与 sum(dream_funds.current) 完全一致 (Bug 7 不变量成立)。
--
--    注意: 这是"破坏性"修复 — total_saved 可能减少 (如果 drift 是正方向)。
--    但 UI 已经用 sum(dream_funds.current) 显示 Balance (buddy-tab.tsx), 所以用户不会看到变化。
--    ProfileTab 和 stats.moneySaved 也用 sum(dream_funds.current) (Round 33 fix), 所以一致。
--    后端 total_saved 字段仍然保留 (向后兼容), 但值与 sum 一致。
--
--    幂等: 多次运行安全 (total_saved 会被设为相同的 sum 值)。

-- ============================================================
-- 1. 修复 buddy_state.total_saved = sum(dream_funds.current)
--    用子查询计算每个用户的 sum, 然后 UPDATE
-- ============================================================
UPDATE public.buddy_state bs
SET total_saved = COALESCE((
  SELECT SUM((elem->>'current')::numeric)
  FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)
), 0),
updated_at = now()
WHERE true;
-- 注意: WHERE true 确保所有行都被更新 (无 WHERE 条件则 UPDATE 0 行)

-- ============================================================
-- 2. 验证: 检查是否有 drift (可选, 供 DBA 确认)
--    运行后此查询应返回 0 行
-- ============================================================
-- SELECT user_id, total_saved,
--   COALESCE((SELECT SUM((elem->>'current')::numeric) FROM jsonb_array_elements(COALESCE(dream_funds, '[]'::jsonb)) AS arr(elem)), 0) AS sum_funds
-- FROM public.buddy_state
-- WHERE total_saved != COALESCE((SELECT SUM((elem->>'current')::numeric) FROM jsonb_array_elements(COALESCE(dream_funds, '[]'::jsonb)) AS arr(elem)), 0);

COMMENT ON TABLE public.buddy_state IS 'Bug 7 fix: total_saved reset to sum(dream_funds.current) — one-time historical drift repair (migration 073)';
