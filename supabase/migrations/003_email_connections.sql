-- ============================================================
-- 003_email_connections.sql — 邮箱 OAuth 连接表
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 邮箱连接记录 (存储 OAuth tokens, 支持多邮箱)
create table public.email_connections (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles(id) on delete cascade,
    email_address   text not null,                                  -- 用户授权的邮箱地址
    provider        text not null default 'gmail' check (provider in ('gmail', 'outlook')),
    access_token    text not null,                                  -- OAuth access token
    refresh_token   text,                                           -- OAuth refresh token (long-term)
    token_expiry    timestamptz,                                    -- access token 过期时间
    scopes          text[] not null default '{}',                   -- 授权的 scope 列表
    status          text not null default 'active' check (status in ('active', 'expired', 'revoked', 'error')),
    last_sync_at    timestamptz,                                    -- 上次同步时间
    last_history_id text,                                           -- Gmail history ID (增量同步用)
    error_message   text,                                           -- 最近一次错误信息
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique(user_id, email_address)                  -- 每个 user+email 只能有一条记录
);

-- 从邮件检测到的购物收据
create table public.email_receipts (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles(id) on delete cascade,
    connection_id   uuid not null references public.email_connections(id) on delete cascade,
    message_id      text not null,                                  -- Gmail message ID
    thread_id       text,                                           -- Gmail thread ID
    from_address    text,                                           -- 发件人
    subject         text,                                           -- 邮件主题
    snippet         text,                                           -- 邮件摘要
    platform        text,                                           -- 识别出的平台 (tiktok_shop / amazon / etc)
    order_id        text,                                           -- 订单号 (如果解析到)
    item_name       text,                                           -- 商品名 (如果解析到)
    amount          numeric,                                        -- 金额 (如果解析到)
    currency        text default 'USD',                             -- 币种
    received_at     timestamptz,                                    -- 邮件接收时间
    impulse_score   integer not null default 0,                     -- 冲动评分
    refund_eligible boolean not null default false,                 -- 是否可退
    refund_deadline timestamptz,                                    -- 退款截止时间
    status          text not null default 'detected' check (status in ('detected', 'actionable', 'refunding', 'refunded', 'ignored')),
    created_at      timestamptz not null default now(),
    unique(user_id, message_id)                     -- 同一邮件不重复记录
);

-- ============================================================
-- RLS
-- ============================================================

alter table public.email_connections enable row level security;
alter table public.email_receipts enable row level security;

-- email_connections: 用户只能读写自己的
create policy "Users read own email connections"
    on public.email_connections for select
    using (auth.uid() = user_id);

create policy "Users insert own email connections"
    on public.email_connections for insert
    with check (auth.uid() = user_id);

create policy "Users update own email connections"
    on public.email_connections for update
    using (auth.uid() = user_id);

create policy "Users delete own email connections"
    on public.email_connections for delete
    using (auth.uid() = user_id);

-- email_receipts: 用户只能读写自己的
create policy "Users read own email receipts"
    on public.email_receipts for select
    using (auth.uid() = user_id);

create policy "Users insert own email receipts"
    on public.email_receipts for insert
    with check (auth.uid() = user_id);

create policy "Users update own email receipts"
    on public.email_receipts for update
    using (auth.uid() = user_id);

-- ============================================================
-- 索引
-- ============================================================

create index idx_email_connections_user on public.email_connections(user_id, status);
create index idx_email_receipts_user_time on public.email_receipts(user_id, received_at desc);
create index idx_email_receipts_user_status on public.email_receipts(user_id, status);
create index idx_email_receipts_platform on public.email_receipts(platform);
