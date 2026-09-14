-- 044: Enable RLS on app_config — deny all direct access
--
-- 🔧 ARCH fix (Round 3 安全审计 C2 — app_config 无 RLS):
--    旧代码 app_config 表从未启用 RLS → 任何人 (含 anon, 用公开的 anon key) 可读取 gateway_key (LLM API key)。
--    攻击者拿到 LLM key 可烧项目预算。
--    根因修复: 启用 RLS, 拒绝所有直接访问 (service_role 绕过 RLS, 仍可读写)。
--    Edge Function config/ 用 service_role, 不受影响。

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- 拒绝 anon + authenticated 的所有操作 (SELECT/INSERT/UPDATE/DELETE)
-- service_role 自动绕过 RLS, 仍可完全访问
CREATE POLICY "app_config deny all direct access"
    ON public.app_config
    FOR ALL
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);

-- 验证 RLS 已启用
DO $$
BEGIN
    ASSERT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE tablename = 'app_config' AND rowsecurity = true
    ), 'app_config RLS was not enabled';
END $$;

COMMENT ON TABLE public.app_config IS
  'Round 3 C2 fix: RLS enabled — only service_role can access (Edge Function uses service_role key)';
