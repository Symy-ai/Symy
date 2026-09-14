-- 068: Fix email_connections status CHECK to allow 'pending' (Round 28 C1)
--
-- 🔧 ARCH fix (Round 28 audit C1 — imap-connect 'pending' 被 CHECK 约束拒绝):
--    migration 003 定义 status CHECK (in 'active','expired','revoked','error') — 'pending' 不在其中。
--    Round 28 fix 设置 status='pending' 但未更新 schema → INSERT 失败 / UPDATE 静默回滚。
--    根因修复: DROP 旧约束, 加包含 'pending' 的新约束。

ALTER TABLE public.email_connections DROP CONSTRAINT IF EXISTS email_connections_status_check;
ALTER TABLE public.email_connections ADD CONSTRAINT email_connections_status_check
  CHECK (status IN ('active', 'expired', 'revoked', 'error', 'pending'));

COMMENT ON CONSTRAINT email_connections_status_check ON public.email_connections IS
  'Round 28 C1: add pending status for IMAP pre-validation';
