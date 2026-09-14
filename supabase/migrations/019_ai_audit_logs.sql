-- ============================================================
-- 019_ai_audit_logs.sql — AI 行为审计日志（道用四·减法 + 六·公开 落地）
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- 目的：记录 AI 每次涉及消费建议/拦截/工具调用的行为，供独立审查院抽查
-- 道经依据：道用四·减法（算法武装心智，非算法诱导消费）+ 道用六·公开（信息全公开）
-- 修改门槛：同总则（详见 constitution.md §五）
-- ============================================================

-- 1. AI 行为审计日志表
create table if not exists public.ai_audit_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    -- 行为类型：consume_recommend（消费建议）/ consume_intercept（消费拦截）/
    --          tool_call（MCP 工具调用）/ challenge_judge（Challenge 判定）/
    --          constitution_violation（疑似违反宪法锁）
    action text not null check (
        action in ('consume_recommend', 'consume_intercept', 'tool_call', 'challenge_judge', 'constitution_violation')
    ),
    -- 风险等级：low（默认）/ medium / high
    -- high = consume_recommend 或 constitution_violation（应被独立审查院优先抽查）
    risk_level text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
    -- 用户输入（截断到 2000 字）
    user_input text,
    -- AI 输出（截断到 2000 字）
    ai_output text,
    -- 工具调用（JSON 数组，记录 name + arguments + result）
    tool_calls jsonb,
    -- 上下文（impulseContext / challengeContext 等）
    context jsonb,
    -- AI 路径：letta / openai_gateway / zai_sdk
    ai_path text,
    -- Agent ID（Letta 路径）
    agent_id text,
    -- 是否触发补偿机制
    compensated boolean default false,
    -- 审查状态：pending / reviewed_ok / reviewed_violation
    review_status text not null default 'pending' check (review_status in ('pending', 'reviewed_ok', 'reviewed_violation')),
    -- 审查员注记（仅独立审查院或 admin 可写）
    review_note text,
    -- 审查时间
    reviewed_at timestamptz,
    -- 创建时间
    created_at timestamptz not null default now()
);

-- 2. 索引
create index if not exists idx_ai_audit_logs_user_id on public.ai_audit_logs(user_id);
create index if not exists idx_ai_audit_logs_created_at on public.ai_audit_logs(created_at desc);
create index if not exists idx_ai_audit_logs_action on public.ai_audit_logs(action);
create index if not exists idx_ai_audit_logs_risk_level on public.ai_audit_logs(risk_level);
create index if not exists idx_ai_audit_logs_review_status on public.ai_audit_logs(review_status);

-- 3. RLS 策略
-- 3.1 用户只能查看自己的审计日志（不能修改/删除）
alter table public.ai_audit_logs enable row level security;

drop policy if exists "Users can read own AI audit logs" on public.ai_audit_logs;
create policy "Users can read own AI audit logs"
    on public.ai_audit_logs for select
    to authenticated
    using (user_id = auth.uid());

-- 3.2 用户不能 insert / update / delete 自己的审计日志
-- 仅 service_role 可写（API Route 用 service_role 写入）
-- 注意：不授予 anon 任何权限

-- 3.3 service_role 全权限（默认 granted，但显式声明）
-- 注意：service_role 绕过 RLS，无需单独 policy

-- 4. 数据保留策略（注释说明，实际由 Supabase scheduled job 执行）
-- 保留 24 个月，超过的归档到 cold storage（独立审查院抽查后归档）
-- 归档由 admin API 触发，不自动删除

-- 5. 注释
comment on table public.ai_audit_logs is 'AI 行为审计日志 — 道用四·减法 + 六·公开 落地，独立审查院月活≥10万后可抽查';
comment on column public.ai_audit_logs.action is '行为类型：consume_recommend=消费建议(high) / consume_intercept=消费拦截 / tool_call=MCP工具 / challenge_judge=Challenge判定 / constitution_violation=疑似违反宪法锁(high)';
comment on column public.ai_audit_logs.risk_level is 'high = 应被独立审查院优先抽查';
comment on column public.ai_audit_logs.review_status is 'pending=待审查 / reviewed_ok=审查通过 / reviewed_violation=审查发现违规';
