-- ============================================================
-- 110: Add auth guards + search_path to 9 SECURITY DEFINER RPCs (P0-3 through P0-6)
-- ============================================================
-- 🔧 2026-07-15 (ARCH-9 #3-6 / P0-3 through P0-6 修复)
--
-- Bug: 9 SECURITY DEFINER RPCs lack auth.uid() guard + SET search_path:
--   From 089 (7 RPCs): update_buddy_growth_stage, awaken_buddy_personality,
--     replenish_daily_need, add_proactive_message, mark_proactive_message_read,
--     decay_daily_needs, bump_intimacy
--   From 082 (1 RPC): use_healing_kit (regression — 077 had search_path, 082 lost it)
--   From 105 (2 RPCs): assign_pool_agent, get_available_agent_count
--
-- Impact: Any authenticated user can call these RPCs via PostgREST with any
--   p_user_id to mutate another user's buddy_state (growth_stage, personality,
--   daily_needs, proactive_messages, intimacy, healing_kit usage, agent pool).
--
-- Fix:
--   1. Add `SET search_path = public` to all 9 RPCs (prevent CVE-2024-7348 search_path injection)
--   2. Add `IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN RAISE EXCEPTION` guard
--      (allows service_role with no auth.uid() to call, blocks cross-user access)
--   3. REVOKE EXECUTE FROM anon, authenticated on RPCs only called by backend (service_role)
--   4. Keep GRANT to authenticated on use_healing_kit (user-facing, but auth guard protects)
--
-- Note: All 7 RPCs from 089 are called via companion-rpc.ts using createAdminClient()
--   (service_role), so revoking from authenticated won't break app functionality.
--   use_healing_kit is called from healing-kit/route.ts using the user's authenticated client.
-- ============================================================

-- ============================================================
-- Part 1: Fix 7 RPCs from migration 089
-- ============================================================

-- 1a. update_buddy_growth_stage
CREATE OR REPLACE FUNCTION public.update_buddy_growth_stage(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  v_level integer;
  v_new_stage text;
  v_old_stage text;
BEGIN
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to update_buddy_growth_stage'
      USING ERRCODE = '42501';
  END IF;

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
END;
$$;

-- 1b. awaken_buddy_personality
CREATE OR REPLACE FUNCTION public.awaken_buddy_personality(
  p_user_id uuid,
  p_personality text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  v_valid boolean;
BEGIN
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to awaken_buddy_personality'
      USING ERRCODE = '42501';
  END IF;

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
END;
$$;

-- 1c. replenish_daily_need
CREATE OR REPLACE FUNCTION public.replenish_daily_need(
  p_user_id uuid,
  p_need_type text,
  p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  v_needs jsonb;
  v_current integer;
  v_new_value integer;
BEGIN
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to replenish_daily_need'
      USING ERRCODE = '42501';
  END IF;

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
END;
$$;

-- 1d. add_proactive_message
CREATE OR REPLACE FUNCTION public.add_proactive_message(
  p_user_id uuid,
  p_trigger text,
  p_text_key text,
  p_text_fallback text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  v_messages jsonb;
  v_new_message jsonb;
  v_id text;
BEGIN
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to add_proactive_message'
      USING ERRCODE = '42501';
  END IF;

  select proactive_messages into v_messages
  from public.buddy_state
  where user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

  v_id := p_trigger || '_' || extract(epoch from now())::bigint::text || '_' || floor(random() * 10000)::text;

  v_new_message := jsonb_build_object(
    'id', v_id,
    'trigger', p_trigger,
    'textKey', p_text_key,
    'textFallback', p_text_fallback,
    'createdAt', now(),
    'read', false
  );

  v_messages := v_new_message || v_messages;
  v_messages := (select jsonb_agg(elem) from (
    select elem from jsonb_array_elements(v_messages) as elem limit 20
  ) sub);

  update public.buddy_state
    set proactive_messages = v_messages, updated_at = now()
    where user_id = p_user_id;

  return v_new_message;
END;
$$;

-- 1e. mark_proactive_message_read
CREATE OR REPLACE FUNCTION public.mark_proactive_message_read(
  p_user_id uuid,
  p_message_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  v_messages jsonb;
BEGIN
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to mark_proactive_message_read'
      USING ERRCODE = '42501';
  END IF;

  select proactive_messages into v_messages
  from public.buddy_state
  where user_id = p_user_id
  for update;

  if not found then
    return null;
  end if;

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
END;
$$;

-- 1f. decay_daily_needs
CREATE OR REPLACE FUNCTION public.decay_daily_needs(
  p_user_id uuid,
  p_decay_amount integer default 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  v_needs jsonb;
  v_clarity integer;
  v_connection integer;
  v_breath integer;
BEGIN
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to decay_daily_needs'
      USING ERRCODE = '42501';
  END IF;

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
END;
$$;

-- 1g. bump_intimacy
CREATE OR REPLACE FUNCTION public.bump_intimacy(
  p_user_id uuid,
  p_delta integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  v_current integer;
  v_new integer;
BEGIN
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to bump_intimacy'
      USING ERRCODE = '42501';
  END IF;

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
END;
$$;

-- Revoke from authenticated (all 7 are called via service_role only)
REVOKE EXECUTE ON FUNCTION public.update_buddy_growth_stage(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.awaken_buddy_personality(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.replenish_daily_need(uuid, text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_proactive_message(uuid, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_proactive_message_read(uuid, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decay_daily_needs(uuid, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_intimacy(uuid, integer) FROM anon, authenticated;
-- Keep service_role grant
GRANT EXECUTE ON FUNCTION public.update_buddy_growth_stage(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.awaken_buddy_personality(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.replenish_daily_need(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_proactive_message(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_proactive_message_read(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decay_daily_needs(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_intimacy(uuid, integer) TO service_role;

-- ============================================================
-- Part 2: Fix use_healing_kit (082 regression — add search_path + auth guard)
-- ============================================================
-- use_healing_kit is called from healing-kit/route.ts using the user's authenticated client.
-- Keep GRANT to authenticated, but add auth guard + search_path.

CREATE OR REPLACE FUNCTION public.use_healing_kit(p_user_id UUID, p_timezone TEXT DEFAULT 'UTC')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  bs RECORD;
  today_date DATE;
  last_kit_local TIMESTAMPTZ;
  new_vitality INTEGER;
  new_tokens INTEGER;
  new_level INTEGER;
  new_xp INTEGER;
  new_xp_to_next INTEGER;
  new_version INTEGER;
  new_health TEXT;
BEGIN
  -- 🔧 2026-07-15 (P0-5): auth guard + search_path (082 regression fix)
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to use_healing_kit'
      USING ERRCODE = '42501';
  END IF;

  today_date := (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(p_timezone, 'UTC'))::DATE;

  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;

  IF bs.last_healing_kit_at IS NOT NULL THEN
    last_kit_local := bs.last_healing_kit_at AT TIME ZONE COALESCE(p_timezone, 'UTC');
    IF last_kit_local::DATE = today_date THEN
      RETURN jsonb_build_object(
        'success', false,
        'reason', 'already_used_today',
        'last_healing_kit_at', bs.last_healing_kit_at
      );
    END IF;
  END IF;

  -- Apply healing kit rewards
  new_vitality := LEAST(100, COALESCE(bs.vitality, 72) + 30);
  new_tokens := COALESCE(bs.tokens, 156) + 10;
  new_xp := COALESCE(bs.xp, 0) + 5;
  new_xp_to_next := COALESCE(bs.xp_to_next, 100);
  new_level := COALESCE(bs.level, 1);

  IF new_xp >= new_xp_to_next THEN
    new_xp := new_xp - new_xp_to_next;
    new_xp_to_next := FLOOR(new_xp_to_next * 1.3)::INTEGER;
    new_level := new_level + 1;
  END IF;

  new_health := CASE
    WHEN new_vitality <= 0 THEN 'dormant'
    WHEN new_vitality <= 20 THEN 'critical'
    WHEN new_vitality <= 45 THEN 'weak'
    WHEN new_vitality <= 75 THEN 'healthy'
    ELSE 'thriving'
  END;

  new_version := COALESCE(bs.version, 1) + 1;

  UPDATE public.buddy_state SET
    vitality = new_vitality,
    tokens = new_tokens,
    health = new_health,
    xp = new_xp,
    xp_to_next = new_xp_to_next,
    level = new_level,
    last_healing_kit_at = now(),
    version = new_version,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'vitality', new_vitality,
    'tokens', new_tokens,
    'health', new_health,
    'xp', new_xp,
    'xp_to_next', new_xp_to_next,
    'level', new_level,
    'version', new_version
  );
END;
$$;

-- Re-grant (keep authenticated — user-facing via healing-kit/route.ts)
REVOKE EXECUTE ON FUNCTION public.use_healing_kit(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.use_healing_kit(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.use_healing_kit(UUID, TEXT) IS
  '2026-07-15 (P0-5): Restored SET search_path + auth guard (082 regression from 077).';

-- ============================================================
-- Part 3: Fix assign_pool_agent + get_available_agent_count (105)
-- ============================================================
-- These are called from letta-agent-pool.ts using createAdminClient() (service_role).
-- Revoke from anon/public (default), grant only to service_role.
--
-- 🔧 2026-07-15 fix: migration 105 defined assign_pool_agent RETURNS TEXT
--   (letta_agent_id column is TEXT, not UUID). Must DROP first because
--   CREATE OR REPLACE cannot change return type. Also keep TEXT return
--   type to match column type and existing callers.

-- get_available_agent_count: no return type change, but add DROP for safety
DROP FUNCTION IF EXISTS public.get_available_agent_count();
CREATE FUNCTION public.get_available_agent_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.letta_agent_pool
  WHERE status = 'available';
  RETURN v_count;
END;
$$;

-- assign_pool_agent: DROP first (105 returns TEXT, 110 originally tried UUID)
DROP FUNCTION IF EXISTS public.assign_pool_agent(UUID);
CREATE FUNCTION public.assign_pool_agent(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  v_agent_id TEXT;
  v_pool_id UUID;
BEGIN
  -- 🔧 2026-07-15 (P0-6): auth guard — only the user themselves or service_role can assign
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to assign_pool_agent'
      USING ERRCODE = '42501';
  END IF;

  -- Match 105's logic: select both id and letta_agent_id, update by id
  SELECT id, letta_agent_id INTO v_pool_id, v_agent_id
  FROM public.letta_agent_pool
  WHERE status = 'available'
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RETURN NULL;  -- 池子空
  END IF;

  UPDATE public.letta_agent_pool
  SET status = 'assigned', assigned_to = p_user_id, assigned_at = now()
  WHERE id = v_pool_id;

  RETURN v_agent_id;
END;
$$;

-- Revoke from anon and authenticated (only service_role should call these)
REVOKE EXECUTE ON FUNCTION public.get_available_agent_count() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.assign_pool_agent(UUID) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_available_agent_count() TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_pool_agent(UUID) TO service_role;

COMMENT ON FUNCTION public.get_available_agent_count() IS
  '2026-07-15 (P0-6): Added SET search_path + REVOKE from anon/authenticated/public. Service-role only.';
COMMENT ON FUNCTION public.assign_pool_agent(UUID) IS
  '2026-07-15 (P0-6): Added SET search_path + auth guard + REVOKE from anon/authenticated/public. Service-role only. Returns TEXT (matches letta_agent_id column type).';
