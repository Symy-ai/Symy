# RLS 审计存档（2026-10-01，rls 车道）

> 原 supabase/migrations/147_rls_audit_findings.sql — 纯注释无 DDL，为免 migration runner 空跑移至 doc/。

## 审计结论
- no current UPDATE policy lacks WITH CHECK; no migration added here.

## ⚠️ 勘误（2026-10-11 R475，v13 RLS 复审）
上述结论**有误**。实测 4 处 UPDATE policy 缺 WITH CHECK（USING-only = 用户可改 user_id 转移行所有权）：
- butterfly_sessions_update (014)
- active_challenges_update_own (031)
- why_wall_update_own / reflection_update_own (128)

（初判 5 处含 avatars_update (074)，R476 复核排除——114 已 DROP 重建为 avatars_update_policy 且 WITH CHECK 双全。）

漏检根因：审计方法未覆盖 storage schema + 旧迁移文件（031 先于审计存在但被漏检）。
修复：148_rls_policy_guard.sql 内联 backfill ALTER POLICY ×5 + 守卫扩 storage schema。
教训：审计结论「零 GAP」须以机器可复核扫描佐证（pg_policies 实查），不能只靠人工读清单。

## 列级策略候选（owner 审阅）
-- 1. public.email_connections.access_token / refresh_token
-- 2. public.profiles.email
-- 3. public.profiles.letta_agent_id

## 社区 SELECT 宽松策略为产品有意面（无需动作）
-- public.daily_reflections, public.daily_reflection_votes.
- inward_* 旧宽松 SELECT 策略：无用户面端点引用（可择期收紧，非紧急）
