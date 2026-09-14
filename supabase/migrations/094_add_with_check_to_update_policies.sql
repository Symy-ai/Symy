-- ============================================================
-- 091_add_with_check_to_update_policies.sql — Add WITH CHECK to UPDATE policies
--
-- 🔧 Round 94 安全审查发现: 4 个表的 UPDATE policy 只有 USING 没有 WITH CHECK.
--    USING 只检查旧行, WITH CHECK 检查新行.
--    没有 WITH CHECK = 用户可以 UPDATE 把 user_id 改成别人的 → 跨用户数据转移.
--
-- 受影响表:
-- 1. profiles (UPDATE) — 用户可以改 id 字段 → 把 profile 转移给别人
-- 2. heal_sessions (UPDATE) — 用户可以改 user_id → 把 heal session 转移给别人
-- 3. refund_requests (UPDATE) — 用户可以改 user_id → 把 refund 转移给别人
-- 4. email_connections (UPDATE) — 用户可以改 user_id → 把 email 连接转移给别人
--
-- 修复: DROP + CREATE 每个 UPDATE policy, 加 WITH CHECK.
-- ============================================================

-- 1. profiles: UPDATE policy 加 WITH CHECK
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 2. heal_sessions: UPDATE policy 加 WITH CHECK
DROP POLICY IF EXISTS "Users update own heal sessions" ON public.heal_sessions;
CREATE POLICY "Users update own heal sessions"
    ON public.heal_sessions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. refund_requests: UPDATE policy 加 WITH CHECK
DROP POLICY IF EXISTS "Users update own refund requests" ON public.refund_requests;
CREATE POLICY "Users update own refund requests"
    ON public.refund_requests FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. email_connections: UPDATE policy 加 WITH CHECK
DROP POLICY IF EXISTS "Users update own email connections" ON public.email_connections;
CREATE POLICY "Users update own email connections"
    ON public.email_connections FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
