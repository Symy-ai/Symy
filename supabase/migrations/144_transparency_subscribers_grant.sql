-- Migration 144: GRANT INSERT on transparency_subscribers to anon
-- 修复 migration 143 的遗漏: RLS policy 允许 anon INSERT, 但表权限未授予 anon 角色,
-- 导致公开订阅端点 POST /api/transparency/subscribe 收到 42501 permission denied
-- (route 层表现为 500 "Failed to subscribe")。
-- 幂等: 重复执行无害。

GRANT INSERT ON TABLE public.transparency_subscribers TO anon;
GRANT INSERT ON TABLE public.transparency_subscribers TO authenticated;
