-- ============================================================
-- 142: user_inventory — 复用优先物品清单 (batch81-c, BP p12/15/18)
-- ============================================================
-- BP: 「复用优先 = 真护城河：物品清单全平台无人掌握」— 对话预检卡片
-- 确认「家里有」时落一条 (source='chat'), 从第一天起做数据壁垒。
-- owner 手动执行 (铁律②); 表未建期间 API 优雅降级
-- (GET → { items: [], inventoryEnabled: false }), 不阻塞对话链路。
--
-- RLS: 用户只读写自己的行, 四操作全 policy on auth.uid() = user_id,
-- UPDATE 带 WITH CHECK 防止把行改挂到别人名下。

create table if not exists public.user_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_name text not null,
  category text,
  source text not null default 'chat',
  created_at timestamptz not null default now()
);

-- 索引: 列表按 created_at desc (GET 口径), 复合键走 user 过滤
create index if not exists idx_user_inventory_user_created
  on public.user_inventory(user_id, created_at desc);

alter table public.user_inventory enable row level security;

create policy "Users can view own inventory items"
  on public.user_inventory for select
  using (auth.uid() = user_id);

create policy "Users can insert own inventory items"
  on public.user_inventory for insert
  with check (auth.uid() = user_id);

create policy "Users can update own inventory items"
  on public.user_inventory for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own inventory items"
  on public.user_inventory for delete
  using (auth.uid() = user_id);

comment on table public.user_inventory is
  'Reuse-first inventory: items the user confirmed owning at home (chat duplicate-precheck "reuse" decision or manual entry). Moat data — RLS self-only, never shared cross-user. Owner-executed; API degrades gracefully when absent.';
