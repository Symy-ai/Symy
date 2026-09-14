-- ============================================================
-- 087_buddy_state_rls_with_check.sql — Add WITH CHECK to buddy_state UPDATE policy
--
-- 🔧 ARCH fix Round 74 (Audit Finding 11):
--    旧代码: UPDATE policy 只有 USING (auth.uid() = user_id), 无 WITH CHECK.
--    问题: 用户可以通过客户端 Supabase SDK 直接 UPDATE buddy_state, 绕过 /api/buddy/state
--    服务端路由的 CAS + 限制检查. 可设置 challenge_count = -100, tokens = 999999 等.
--    根因修复: 加 WITH CHECK (auth.uid() = user_id), 至少防止跨用户修改.
--    深层修复 (未来): 将 challenge_count/gacha_pulls_count/tokens 等敏感列移到
--    SECURITY DEFINER RPC, 客户端无直接 UPDATE 权限.
--
-- 注意: 此 migration 不影响服务端代码 (service_role key 绕过 RLS).
--    buddy-sync.ts 客户端通过 /api/buddy/state API 路由 push (不直接 UPDATE Supabase),
--    所以 WITH CHECK 不影响正常流程.
-- ============================================================

-- Drop existing UPDATE policy (no WITH CHECK)
drop policy if exists "Users update own buddy state" on public.buddy_state;

-- Recreate with WITH CHECK — prevents cross-user updates
-- (USING controls which rows can be updated; WITH CHECK controls what new values are allowed)
create policy "Users update own buddy state"
    on public.buddy_state for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
