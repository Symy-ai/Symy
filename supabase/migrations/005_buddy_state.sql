-- ============================================================
-- 005_buddy_state.sql — Buddy companion state persistence
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Buddy state table: one row per user, stores the companion's state
-- This enables cross-device sync via Supabase Realtime
create table public.buddy_state (
    user_id             uuid primary key references public.profiles(id) on delete cascade,
    vitality            numeric not null default 72,
    tokens              integer not null default 156,
    health              text not null default 'healthy' check (health in ('thriving', 'healthy', 'weak', 'critical', 'dormant')),
    level               integer not null default 3,
    xp                  integer not null default 45,
    xp_to_next          integer not null default 100,
    streak              integer not null default 7,
    dream_funds         jsonb not null default '[]',
    badges              jsonb not null default '[]',
    total_saved         numeric not null default 847,
    challenges_completed integer not null default 12,
    last_drain_at       timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- RLS
alter table public.buddy_state enable row level security;

create policy "Users read own buddy state"
    on public.buddy_state for select
    using (auth.uid() = user_id);

create policy "Users insert own buddy state"
    on public.buddy_state for insert
    with check (auth.uid() = user_id);

create policy "Users update own buddy state"
    on public.buddy_state for update
    using (auth.uid() = user_id);

-- Index
create index idx_buddy_state_user on public.buddy_state(user_id);

-- Auto-create buddy_state row when a new user signs up
-- (triggered by the existing auth trigger that creates a profile)
create or replace function public.handle_new_buddy_state()
returns trigger
language plpgsql
security definer
as $$
begin
    insert into public.buddy_state (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

-- Attach to the existing user creation trigger
-- Note: If you already have a handle_new_user trigger, add this call there instead
create trigger on_create_buddy_state
    after insert on public.profiles
    for each row
    execute function public.handle_new_buddy_state();

-- Enable Realtime for buddy_state (for cross-device sync)
alter publication supabase_realtime add table public.buddy_state;
