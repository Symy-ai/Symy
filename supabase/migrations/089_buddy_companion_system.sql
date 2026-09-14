-- ============================================================
-- 089_buddy_companion_system.sql — Symy 宠物陪伴感与个性成长系统 (P1-5)
--
-- 新增字段:
--   growth_stage          text      — 成长阶段 (baby/young/adult/elder), 基于 level 派生但持久化
--   personality           text      — 个性 (unknown/sage/playmate/guardian/ascetic), 第 7 天觉醒
--   intimacy              int       — 亲密度 0-100 (独立于 vitality, 衡量用户与 Symy 的关系深度)
--   daily_needs           jsonb     — 日常需求 {clarity, connection, breath}, 0-100, 每日衰减
--   proactive_messages    jsonb     — 主动留言数组 [{id, trigger, textKey, createdAt, read}]
--   personality_awakened_at timestamptz — 个性觉醒时间 (null = 未觉醒)
--   last_active_at        timestamptz — 用户最后活跃时间 (用于触发 long_absence 留言)
--
-- 设计原则:
--   1. growth_stage / personality / proactive_messages 是服务端管理字段
--      客户端 PUT 不能直接写, 只能通过 RPC / API route 更新
--      (防止客户端伪造成长阶段或个性)
--   2. intimacy / daily_needs 客户端可写 (有 clamp + CHECK 约束)
--   3. daily_needs 默认 100/100/100 (满), 每日衰减 20
--   4. proactive_messages 数组上限 20 条 (防无限增长)
--
-- 架构对齐:
--   - 复用 buddy_state 现有 CAS version 乐观锁
--   - 复用 Realtime (自动推送新字段变更)
--   - 复用 RLS (auth.uid() = user_id)
-- ============================================================

-- 1. 加列 (幂等)
alter table public.buddy_state
  add column if not exists growth_stage text default 'baby'
    check (growth_stage in ('baby', 'young', 'adult', 'elder'));

alter table public.buddy_state
  add column if not exists personality text default 'unknown'
    check (personality in ('unknown', 'sage', 'playmate', 'guardian', 'ascetic'));

alter table public.buddy_state
  add column if not exists intimacy integer default 0
    check (intimacy >= 0 and intimacy <= 100);

alter table public.buddy_state
  add column if not exists daily_needs jsonb default '{"clarity":100,"connection":100,"breath":100}'::jsonb;

alter table public.buddy_state
  add column if not exists proactive_messages jsonb default '[]'::jsonb;

alter table public.buddy_state
  add column if not exists personality_awakened_at timestamptz;

alter table public.buddy_state
  add column if not exists last_active_at timestamptz default now();

-- 2. 回填现有行 (growth_stage 基于 level 派生)
update public.buddy_state
  set growth_stage = case
    when level >= 41 then 'elder'
    when level >= 16 then 'adult'
    when level >= 6 then 'young'
    else 'baby'
  end
  where growth_stage is null or growth_stage = 'baby';

-- 3. RPC: update_buddy_growth_stage — 根据 level 自动更新 growth_stage
--    在 level 变化时由后端调用 (MCP add_tokens / complete_challenge 等)
create or replace function public.update_buddy_growth_stage(p_user_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_level integer;
  v_new_stage text;
  v_old_stage text;
begin
  select level, growth_stage into v_level, v_old_stage
  from public.buddy_state
  where user_id = p_user_id
  for update;

  if not found then
    return 'not_found';
  end if;

  v_new_stage := case
    when v_level >= 41 then 'elder'
    when v_level >= 16 then 'adult'
    when v_level >= 6 then 'young'
    else 'baby'
  end;

  if v_new_stage <> v_old_stage then
    update public.buddy_state
      set growth_stage = v_new_stage, updated_at = now()
      where user_id = p_user_id;
    return v_new_stage;
  end if;

  return v_old_stage;
end;
$$;

-- 4. RPC: awaken_buddy_personality — 觉醒个性 (第 7 天或手动触发)
--    传入 personality 类型, 设置 personality_awakened_at
create or replace function public.awaken_buddy_personality(
  p_user_id uuid,
  p_personality text
)
returns text
language plpgsql
security definer
as $$
declare
  v_valid boolean;
begin
  v_valid := p_personality in ('sage', 'playmate', 'guardian', 'ascetic');
  if not v_valid then
    raise exception 'Invalid personality: %', p_personality;
  end if;

  update public.buddy_state
    set personality = p_personality,
        personality_awakened_at = coalesce(personality_awakened_at, now()),
        updated_at = now()
    where user_id = p_user_id;

  return p_personality;
end;
$$;

-- 5. RPC: replenish_daily_need — 补充某个需求
--    p_need_type: 'clarity' | 'connection' | 'breath'
--    p_amount: 正整数 (会被 clamp 到 100)
create or replace function public.replenish_daily_need(
  p_user_id uuid,
  p_need_type text,
  p_amount integer
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_needs jsonb;
  v_current integer;
  v_new_value integer;
begin
  if p_need_type not in ('clarity', 'connection', 'breath') then
    raise exception 'Invalid need type: %', p_need_type;
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be positive: %', p_amount;
  end if;

  select daily_needs into v_needs
  from public.buddy_state
  where user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  v_current := coalesce((v_needs->>p_need_type)::integer, 0);
  v_new_value := least(100, v_current + p_amount);

  v_needs := jsonb_set(v_needs, array[p_need_type], to_jsonb(v_new_value));

  update public.buddy_state
    set daily_needs = v_needs, updated_at = now()
    where user_id = p_user_id;

  return v_needs;
end;
$$;

-- 6. RPC: add_proactive_message — 添加主动留言
--    p_trigger: 触发类型 (morning_checkin/long_absence/streak_milestone 等)
--    p_text_key: i18n key 或直接文本
--    p_text_fallback: 如果 i18n key 不存在用的 fallback 文本
create or replace function public.add_proactive_message(
  p_user_id uuid,
  p_trigger text,
  p_text_key text,
  p_text_fallback text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_messages jsonb;
  v_new_message jsonb;
  v_id text;
begin
  select proactive_messages into v_messages
  from public.buddy_state
  where user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  -- 生成唯一 ID (trigger + timestamp + random)
  v_id := p_trigger || '_' || extract(epoch from now())::bigint::text || '_' || floor(random() * 10000)::text;

  v_new_message := jsonb_build_object(
    'id', v_id,
    'trigger', p_trigger,
    'textKey', p_text_key,
    'textFallback', p_text_fallback,
    'createdAt', now(),
    'read', false
  );

  -- 新消息加到数组头部, 保留最近 20 条
  v_messages := v_new_message || v_messages;
  v_messages := (select jsonb_agg(elem) from (
    select elem from jsonb_array_elements(v_messages) as elem limit 20
  ) sub);

  update public.buddy_state
    set proactive_messages = v_messages, updated_at = now()
    where user_id = p_user_id;

  return v_new_message;
end;
$$;

-- 7. RPC: mark_proactive_message_read — 标记留言已读
create or replace function public.mark_proactive_message_read(
  p_user_id uuid,
  p_message_id text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_messages jsonb;
  v_updated boolean := false;
begin
  select proactive_messages into v_messages
  from public.buddy_state
  where user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  -- 遍历数组, 标记匹配的消息为 read=true
  v_messages := (
    select jsonb_agg(
      case
        when elem->>'id' = p_message_id then jsonb_set(elem, '{read}', 'true'::jsonb)
        else elem
      end
    )
    from jsonb_array_elements(v_messages) as elem
  );

  update public.buddy_state
    set proactive_messages = v_messages, updated_at = now()
    where user_id = p_user_id;

  return v_messages;
end;
$$;

-- 8. RPC: decay_daily_needs — 衰减日常需求 (每日凌晨调用)
--    衰减量: 20 (如果当天未补充, 需求降到 80, 持续不补充 5 天后到 0)
create or replace function public.decay_daily_needs(
  p_user_id uuid,
  p_decay_amount integer default 20
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_needs jsonb;
  v_clarity integer;
  v_connection integer;
  v_breath integer;
begin
  select daily_needs into v_needs
  from public.buddy_state
  where user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  v_clarity := greatest(0, coalesce((v_needs->>'clarity')::integer, 0) - p_decay_amount);
  v_connection := greatest(0, coalesce((v_needs->>'connection')::integer, 0) - p_decay_amount);
  v_breath := greatest(0, coalesce((v_needs->>'breath')::integer, 0) - p_decay_amount);

  v_needs := jsonb_build_object(
    'clarity', v_clarity,
    'connection', v_connection,
    'breath', v_breath
  );

  update public.buddy_state
    set daily_needs = v_needs, updated_at = now()
    where user_id = p_user_id;

  return v_needs;
end;
$$;

-- 9. RPC: bump_intimacy — 增加亲密度 (带 clamp)
create or replace function public.bump_intimacy(
  p_user_id uuid,
  p_delta integer
)
returns integer
language plpgsql
security definer
as $$
declare
  v_current integer;
  v_new integer;
begin
  select intimacy into v_current
  from public.buddy_state
  where user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  v_new := greatest(0, least(100, v_current + p_delta));

  update public.buddy_state
    set intimacy = v_new, updated_at = now()
    where user_id = p_user_id;

  return v_new;
end;
$$;

-- 10. 授权 (RLS 已存在, 新列自动继承)
--     RPC 函数给 authenticated 和 service_role
grant execute on function public.update_buddy_growth_stage(uuid) to authenticated, service_role;
grant execute on function public.awaken_buddy_personality(uuid, text) to authenticated, service_role;
grant execute on function public.replenish_daily_need(uuid, text, integer) to authenticated, service_role;
grant execute on function public.add_proactive_message(uuid, text, text, text) to authenticated, service_role;
grant execute on function public.mark_proactive_message_read(uuid, text) to authenticated, service_role;
grant execute on function public.decay_daily_needs(uuid, integer) to authenticated, service_role;
grant execute on function public.bump_intimacy(uuid, integer) to authenticated, service_role;

-- 11. 注释
comment on column public.buddy_state.growth_stage is 'P1-5: 成长阶段 baby/young/adult/elder, 基于 level 派生';
comment on column public.buddy_state.personality is 'P1-5: 个性 unknown/sage/playmate/guardian/ascetic';
comment on column public.buddy_state.intimacy is 'P1-5: 亲密度 0-100, 独立于 vitality';
comment on column public.buddy_state.daily_needs is 'P1-5: 日常需求 {clarity,connection,breath} 0-100';
comment on column public.buddy_state.proactive_messages is 'P1-5: 主动留言数组, 最多 20 条';
comment on column public.buddy_state.personality_awakened_at is 'P1-5: 个性觉醒时间';
comment on column public.buddy_state.last_active_at is 'P1-5: 用户最后活跃时间';
