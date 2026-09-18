-- ============================================================
-- 141: transparency_snapshots — 每周透明度报告快照 (batch81-a)
-- ============================================================
-- 可选持久化表: 交 owner 手动执行。代码 (transparency-weekly-server) 在表
-- 不存在时读写都静默降级 (进程内缓存/零值骨架), 不阻塞 — 本表只为跨实例
-- 保留最后一份成功聚合, 聚合失败时页面/API 有缓存快照可回。
--
-- RLS: 启用且不建任何 policy — 平台账本不开放行级公读, 仅 service_role
-- (admin client) 可读写 (service role 天然绕过 RLS)。

create table if not exists public.transparency_snapshots (
  week_start date primary key,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.transparency_snapshots enable row level security;

comment on table public.transparency_snapshots is
  'Weekly transparency report snapshots (build in public). Platform-level aggregates only — no user-level fields by contract. Owner-executed; code degrades gracefully when absent.';
