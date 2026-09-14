-- Migration 056: Round 13 — admin_audit_logs 表 + admin actor identity
--
-- 🔧 ARCH fix (Round 13 BUG-14):
--    旧代码: verifyAdminAuth 返回 { authorized, error? }, 无 admin identity
--    所有 admin 操作无审计日志, 多 admin 协作时无问责
--    根因修复:
--    1. 新建 admin_audit_logs 表 (service_role only, RLS enabled)
--    2. admin-auth.ts 读取 X-Admin-Actor header, 返回 actor 字段
--    3. withAdminAudit helper 异步写入审计日志 (fire-and-forget, 不阻断主请求)

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 谁做了操作 (从 X-Admin-Actor header 读)
  actor TEXT NOT NULL,
  -- 做了什么
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  action TEXT,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- 操作细节
  request_body JSONB,
  request_query JSONB,
  -- 结果
  status_code INTEGER NOT NULL,
  response_summary TEXT,
  error_message TEXT,
  -- 元数据
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON public.admin_audit_logs(actor, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_route ON public.admin_audit_logs(route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target_user ON public.admin_audit_logs(target_user_id, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
-- 仅 service_role 可读写; authenticated/anon 无任何权限
REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO service_role;

COMMENT ON TABLE public.admin_audit_logs IS 'Round 13 BUG-14: admin 操作审计日志 (actor from X-Admin-Actor header)';
