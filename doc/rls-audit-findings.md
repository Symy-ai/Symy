# RLS 审计存档（2026-10-01，rls 车道）

> 原 supabase/migrations/147_rls_audit_findings.sql — 纯注释无 DDL，为免 migration runner 空跑移至 doc/。

## 审计结论
- no current UPDATE policy lacks WITH CHECK; no migration added here.

## 列级策略候选（owner 审阅）
-- 1. public.email_connections.access_token / refresh_token
-- 2. public.profiles.email
-- 3. public.profiles.letta_agent_id

## 社区 SELECT 宽松策略为产品有意面（无需动作）
-- public.daily_reflections, public.daily_reflection_votes.
- inward_* 旧宽松 SELECT 策略：无用户面端点引用（可择期收紧，非紧急）
