-- ============================================================
-- 001_init.sql — we=me MVP schema
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 用户画像 (1:1 关联 Supabase auth.users)
create table public.profiles (
    id          uuid primary key references auth.users on delete cascade,
    email       text,
    display_name text,
    avatar_url  text,
    plan        text not null default 'free' check (plan in ('free', 'premium')),
    avg_amount  numeric not null default 0,
    timezone    text not null default 'America/New_York',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- 冲动事件记录 (每次推送/捕捉/巡检都会记录)
create table public.impulse_events (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    platform      text not null,                                  -- tiktok_shop / amazon / target / walmart
    source        text not null default 'notification' check (source in ('notification','accessibility','patrol','manual')),
    title         text,
    amount        numeric,
    category      text,
    is_livestream boolean not null default false,
    is_flash_sale boolean not null default false,
    impulse_score integer not null default 0,
    reasons       jsonb not null default '[]',
    raw_text      text,
    created_at    timestamptz not null default now()
);

-- 治愈对话记录
create table public.heal_sessions (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    event_id      uuid references public.impulse_events(id) on delete set null,
    platform      text,
    amount        numeric,
    messages      jsonb not null default '[]',    -- [{role, content, ts}]
    technique     text,                            -- cbt / mindfulness / act
    resolved      boolean not null default false,
    model_used    text,
    token_count   integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

-- 退款请求记录
create table public.refund_requests (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references public.profiles(id) on delete cascade,
    event_id      uuid references public.impulse_events(id) on delete set null,
    platform      text not null,
    order_id      text,
    item_name     text,
    refund_reason text,
    refund_amount numeric,
    status        text not null default 'pending'
                  check (status in ('pending','submitted','confirmed','rejected','error')),
    created_at    timestamptz not null default now(),
    completed_at  timestamptz
);

-- 每日统计 (由 Edge Function 每日汇总)
create table public.daily_stats (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid not null references public.profiles(id) on delete cascade,
    date           date not null,
    total_events   integer not null default 0,
    impulse_count  integer not null default 0,
    total_amount   numeric not null default 0,
    refund_count   integer not null default 0,
    saved_amount   numeric not null default 0,
    created_at     timestamptz not null default now(),
    unique(user_id, date)
);

-- App 远程配置表 (仅 admin 可读写，客户端通过 Edge Function 读取)
create table public.app_config (
    key   text primary key,
    value text not null,
    notes text
);

-- ============================================================
-- RLS (Row Level Security) — 用户只能访问自己的数据
-- ============================================================

alter table public.profiles enable row level security;
alter table public.impulse_events enable row level security;
alter table public.heal_sessions enable row level security;
alter table public.refund_requests enable row level security;
alter table public.daily_stats enable row level security;

-- profiles: 用户只能读写自己的
create policy "Users read own profile"
    on public.profiles for select
    using (auth.uid() = id);

create policy "Users update own profile"
    on public.profiles for update
    using (auth.uid() = id);

-- impulse_events: 用户只能插入和读取自己的
create policy "Users insert own impulse events"
    on public.impulse_events for insert
    with check (auth.uid() = user_id);

create policy "Users read own impulse events"
    on public.impulse_events for select
    using (auth.uid() = user_id);

-- heal_sessions: 用户只能插入和读写自己的
create policy "Users insert own heal sessions"
    on public.heal_sessions for insert
    with check (auth.uid() = user_id);

create policy "Users read own heal sessions"
    on public.heal_sessions for select
    using (auth.uid() = user_id);

create policy "Users update own heal sessions"
    on public.heal_sessions for update
    using (auth.uid() = user_id);

-- refund_requests: 用户可以插入、读取、更新自己的
create policy "Users insert own refund requests"
    on public.refund_requests for insert
    with check (auth.uid() = user_id);

create policy "Users read own refund requests"
    on public.refund_requests for select
    using (auth.uid() = user_id);

create policy "Users update own refund requests"
    on public.refund_requests for update
    using (auth.uid() = user_id);

-- daily_stats: 用户只能读取自己的
create policy "Users read own daily stats"
    on public.daily_stats for select
    using (auth.uid() = user_id);

-- ============================================================
-- 索引
-- ============================================================

create index idx_impulse_events_user_time on public.impulse_events(user_id, created_at desc);
create index idx_heal_sessions_user_time on public.heal_sessions(user_id, created_at desc);
create index idx_refund_requests_user_time on public.refund_requests(user_id, created_at desc);
create index idx_daily_stats_user_date on public.daily_stats(user_id, date desc);

-- ============================================================
-- 初始配置数据
-- ============================================================

insert into public.app_config (key, value, notes) values
    ('gateway_url', 'https://your-gateway.example.com', 'LLM API 网关地址 (兼容 OpenAI API)'),
    ('gateway_key', 'sk-placeholder-replace-with-real-key', 'LLM API 网关密钥'),
    ('heal_model', 'gpt-4o-mini', '治愈对话默认模型'),
    ('impulse_threshold', '60', '冲动分数阈值 (>60 触发干预)'),
    ('free_chat_limit', '3', '免费用户每日对话上限'),
    ('patrol_interval_hours', '6', 'RPA 巡检间隔(小时)'),
    ('patrol_wifi_only', 'true', '巡检是否仅 WiFi 下执行');
