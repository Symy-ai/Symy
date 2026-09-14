-- ============================================================
-- 022_user_intervention_profile.sql — 用户干预画像表（CBT 三阶分级 + severity 分级）
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================
-- 目的：存储用户的修身阶段 + 严重度分级 + 滚动指标
-- 道经依据：道体二·共生（AI 记住用户状态，个性化陪伴）
-- 修改门槛：同总则（详见 constitution.md §五）
--
-- 设计：
-- - severity_tier (西方，定强度): severe/moderate/light — 决定 AI 介入频率
-- - cultivation_stage (东方，定风格): zhi_yu/zhi_zhi/cheng_yi/zheng_xin — 决定 AI 对话风格
-- - 两者独立评级，不强制对应
-- - 滚动 7 天指标用于自动计算 severity
-- ============================================================

create table if not exists public.user_intervention_profile (
    user_id uuid primary key references auth.users(id) on delete cascade,

    -- 西方维度：干预强度（自动计算）
    severity_tier text not null default 'severe'
        check (severity_tier in ('severe', 'moderate', 'light')),

    -- 东方维度：修身阶段（AI 评估 + 用户自评取较低值）
    cultivation_stage text not null default 'zhi_yu'
        check (cultivation_stage in (
            'zhi_yu',      -- 知欲（致知阶段起点）
            'zhi_zhi',     -- 知止（致知阶段进阶）
            'cheng_yi',    -- 诚意
            'zheng_xin'    -- 正心
        )),

    -- 阶段进入时间（用于计算停留时长 + 升降级判断）
    stage_entered_at timestamptz not null default now(),

    -- 滚动 7 天指标（由 cron 或 admin API 每日更新）
    weekly_impulse_count integer not null default 0,
    weekly_total_amount numeric not null default 0,
    weekly_avg_impulse_score numeric not null default 0,
    weekly_refund_count integer not null default 0,

    -- 30 天累计指标（用于 cultivation_stage 评估）
    monthly_impulse_count integer not null default 0,
    monthly_resisted_count integer not null default 0,
    monthly_challenge_pass_rate numeric not null default 0,

    -- 用户自评（onboarding 时填，每季度可重填）
    self_reported_severity text check (self_reported_severity in ('none', 'mild', 'moderate', 'severe')),
    self_reported_debt numeric,
    self_reported_triggers text[],

    -- 干预响应模式（AI 观察 + RAG 检索补充）
    responsive_interventions text[],
    unresponsive_interventions text[],

    -- 阶段评估历史（JSON 数组，每次评估追加一条）
    stage_assessment_history jsonb not null default '[]',

    -- 上次重新评估时间
    last_reassessed_at timestamptz not null default now(),

    -- ⚠️ 重度用户警示边界（severe + zhi_yu 阶段触发）
    professional_referral_recommended boolean not null default false,
    referral_reason text,

    updated_at timestamptz not null default now()
);

-- 索引
create index if not exists idx_user_intervention_profile_severity on public.user_intervention_profile(severity_tier);
create index if not exists idx_user_intervention_profile_stage on public.user_intervention_profile(cultivation_stage);

-- RLS：用户只能查自己（select only），写入仅 service_role
alter table public.user_intervention_profile enable row level security;

drop policy if exists "Users can read own intervention profile" on public.user_intervention_profile;
create policy "Users can read own intervention profile"
    on public.user_intervention_profile for select
    to authenticated
    using (user_id = auth.uid());

-- 注释
comment on table public.user_intervention_profile is '用户干预画像 — CBT 三阶分级 + severity 分级 + 滚动指标';
comment on column public.user_intervention_profile.severity_tier is 'severe/moderate/light — 自动计算，决定 AI 介入频率';
comment on column public.user_intervention_profile.cultivation_stage is 'zhi_yu/zhi_zhi/cheng_yi/zheng_xin — 决定 AI 对话风格';
comment on column public.user_intervention_profile.weekly_impulse_count is '滚动 7 天冲动消费次数（cron 更新）';
comment on column public.user_intervention_profile.monthly_challenge_pass_rate is '30 天 Challenge 通过率（用于阶段评估）';

-- ============================================================
-- 自动更新 updated_at 触发器
-- ============================================================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_user_intervention_profile_updated on public.user_intervention_profile;
create trigger trg_user_intervention_profile_updated
    before update on public.user_intervention_profile
    for each row
    execute function public.update_updated_at_column();
