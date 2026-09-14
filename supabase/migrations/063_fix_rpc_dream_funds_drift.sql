-- 063: Fix RPC auto-create dream_funds drift (Round 21 BUG-R21-H1/H2)
--
-- 🔧 ARCH fix (Round 21 BUG-R21-H1 — apply_buddy_state_delta 和 create_health_event_atomic
--    的 auto-create 路径插入空 dream_funds):
--    buddy_state.dream_funds column default 是 '[]'::jsonb (migration 005:17)。
--    RPC 在 buddy_state 不存在时只 INSERT (user_id), dream_funds 走 column default → '[]'。
--    migration 061 修复了 handle_new_buddy_state trigger (新用户注册路径),
--    但没修复 RPC 的 auto-create 路径。
--    后果: 用户在 trigger 失败的极端情况下首次调 health-impact, dream_funds 永久为 [],
--    dream fund UI 显示空, refund_boost 的 p_refund_amount 不应用到任何 fund。
--
-- 🔧 ARCH fix (Round 25 — 修复 "function name is not unique" 错误):
--    旧版 063 用不同的参数签名 (9 params vs 050 的 12 params) CREATE OR REPLACE,
--    PostgreSQL 把它当作新 overload 而非替换 → 两个同名函数 → 后续操作报 "not unique"。
--    根因修复: 先 DROP 旧签名 (指定完整参数列表), 再用 050 的完全相同签名 CREATE OR REPLACE。

-- ============================================================
-- 1. apply_buddy_state_delta — 先 DROP 所有 overload, 再用 050 的 12-param 签名重建
-- ============================================================

-- 先 DROP 050 的 12-param 版本 (如果存在)
DROP FUNCTION IF EXISTS public.apply_buddy_state_delta(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER
);

-- 再 DROP 063 旧版的 9-param overload (如果已执行过旧 063)
DROP FUNCTION IF EXISTS public.apply_buddy_state_delta(
  UUID, INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[]
);

-- 用 050 的完全相同 12-param 签名重建, 只修改 INSERT branch 的 dream_funds
CREATE OR REPLACE FUNCTION public.apply_buddy_state_delta(
  p_user_id              UUID,
  p_token_delta          INTEGER DEFAULT 0,
  p_vitality_delta       INTEGER DEFAULT 0,
  p_xp_delta             INTEGER DEFAULT 0,
  p_challenges_delta     INTEGER DEFAULT 0,
  p_total_saved_delta    NUMERIC DEFAULT 0,
  p_add_badges           TEXT[] DEFAULT '{}',
  p_dream_fund_id        TEXT DEFAULT NULL,
  p_dream_fund_amount    NUMERIC DEFAULT 0,
  p_level_override       INTEGER DEFAULT NULL,
  p_xp_to_next_override  INTEGER DEFAULT NULL,
  p_xp_override          INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  bs RECORD;
  new_vitality INTEGER;
  new_tokens INTEGER;
  new_health TEXT;
  new_xp INTEGER;
  new_xp_to_next INTEGER;
  new_level INTEGER;
  new_total_saved NUMERIC;
  new_challenges INTEGER;
  new_version INTEGER;
  effective_fund_id TEXT;
  updated_dream_funds JSONB;
  fund_idx INTEGER;
  i INTEGER;
  all_badges TEXT[];
  badge_item TEXT;
  merged_badges_jsonb JSONB;
BEGIN
  -- Auth guard (与 043/048 一致)
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to apply_buddy_state_delta'
      USING ERRCODE = '42501';
  END IF;

  -- Lock buddy_state row
  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    -- 🔧 Round 21 H1/H2 fix: auto-create 时显式指定 dream_funds (匹配 buddy-defaults.ts)
    INSERT INTO public.buddy_state (
      user_id, vitality, tokens, health, level, xp, xp_to_next,
      streak, dream_funds, badges, total_saved, challenges_completed,
      last_drain_at, updated_at
    ) VALUES (
      p_user_id, 72, 156, 'healthy', 1, 0, 100, 0,
      '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb,
      '[]'::jsonb, 0, 0, now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Apply deltas (与 050 完全一致)
  new_vitality := GREATEST(0, LEAST(100, COALESCE(bs.vitality, 72) + p_vitality_delta));
  new_tokens := GREATEST(0, COALESCE(bs.tokens, 156) + p_token_delta);

  IF p_xp_override IS NOT NULL THEN
    new_xp := p_xp_override;
  ELSE
    new_xp := GREATEST(0, COALESCE(bs.xp, 0) + p_xp_delta);
  END IF;

  new_xp_to_next := COALESCE(p_xp_to_next_override, COALESCE(bs.xp_to_next, 100));
  new_level := COALESCE(p_level_override, COALESCE(bs.level, 1));

  IF p_xp_override IS NULL AND new_xp >= new_xp_to_next THEN
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

  new_total_saved := GREATEST(0, COALESCE(bs.total_saved, 0) + p_total_saved_delta);
  new_challenges := GREATEST(0, COALESCE(bs.challenges_completed, 0) + p_challenges_delta);

  -- Badge merge (与 050 完全一致)
  all_badges := ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)));
  FOREACH badge_item IN ARRAY p_add_badges LOOP
    IF NOT (badge_item = ANY(all_badges)) THEN
      all_badges := array_append(all_badges, badge_item);
    END IF;
  END LOOP;
  merged_badges_jsonb := COALESCE((SELECT jsonb_agg(b) FROM unnest(all_badges) AS b), '[]'::jsonb);

  -- Dream fund progress (与 050 完全一致, 含 'auto' 解析)
  effective_fund_id := p_dream_fund_id;
  IF effective_fund_id = 'auto' OR effective_fund_id IS NULL THEN
    SELECT elem->>'id' INTO effective_fund_id
    FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)
    WHERE (elem->>'current')::numeric < (elem->>'target')::numeric
    LIMIT 1;
    IF effective_fund_id IS NULL THEN
      SELECT elem->>'id' INTO effective_fund_id
      FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)
      LIMIT 1;
    END IF;
  END IF;

  updated_dream_funds := COALESCE(bs.dream_funds, '[]'::jsonb);

  IF effective_fund_id IS NOT NULL AND p_dream_fund_amount != 0 THEN
    fund_idx := -1;
    FOR i IN 0..jsonb_array_length(updated_dream_funds) - 1 LOOP
      IF (updated_dream_funds -> i ->> 'id') = effective_fund_id THEN
        fund_idx := i;
        EXIT;
      END IF;
    END LOOP;

    IF fund_idx >= 0 THEN
      updated_dream_funds := jsonb_set(
        updated_dream_funds,
        ARRAY[fund_idx::text, 'current'],
        to_jsonb(LEAST(
          COALESCE((updated_dream_funds -> fund_idx ->> 'target')::numeric, 0),
          GREATEST(0, COALESCE((updated_dream_funds -> fund_idx ->> 'current')::numeric, 0) + p_dream_fund_amount)
        ))
      );
    END IF;
  END IF;

  -- Version bump (Round 11 D2)
  new_version := COALESCE(bs.version, 1) + 1;

  -- Update buddy_state
  UPDATE public.buddy_state
  SET
    vitality = new_vitality,
    tokens = new_tokens,
    health = new_health,
    xp = new_xp,
    xp_to_next = new_xp_to_next,
    level = new_level,
    total_saved = new_total_saved,
    challenges_completed = new_challenges,
    badges = merged_badges_jsonb,
    dream_funds = updated_dream_funds,
    version = new_version,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'vitality', new_vitality,
    'tokens', new_tokens,
    'health', new_health,
    'level', new_level,
    'xp', new_xp,
    'xp_to_next', new_xp_to_next,
    'streak', COALESCE(bs.streak, 0),
    'dream_funds', updated_dream_funds,
    'badges', merged_badges_jsonb,
    'total_saved', new_total_saved,
    'challenges_completed', new_challenges,
    'version', new_version
  );
END;
$$;

-- 权限 (与 050 一致: authenticated + service_role)
REVOKE ALL ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_buddy_state_delta IS
  'Round 25: restore 050 12-param signature + 063 dream_funds INSERT fix (target=2000, emoji=🏔️)';

-- ============================================================
-- 2. create_health_event_atomic — 先 DROP 所有 overload, 再用 054 的 11-param 签名重建
-- ============================================================

-- 先 DROP 054 的 11-param 版本 (如果存在)
DROP FUNCTION IF EXISTS public.create_health_event_atomic(
  UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT
);

-- 再 DROP 063 旧版的 10-param overload (如果已执行过旧 063)
DROP FUNCTION IF EXISTS public.create_health_event_atomic(
  UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[]
);

-- 用 054 的完全相同 11-param 签名重建, 含 dedup + version bump + dream_funds INSERT fix
CREATE OR REPLACE FUNCTION public.create_health_event_atomic(
  p_user_id UUID,
  p_event_type TEXT,
  p_vitality_change INTEGER DEFAULT 0,
  p_token_change INTEGER DEFAULT 0,
  p_trigger_source TEXT DEFAULT 'chat_mcp',
  p_trigger_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT '',
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_refund_amount NUMERIC DEFAULT 0,
  p_new_badges TEXT[] DEFAULT '{}',
  p_dream_fund_id TEXT DEFAULT 'df-1'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  bs RECORD;
  v_new_vitality INTEGER;
  v_new_tokens INTEGER;
  v_new_health TEXT;
  event_id UUID;
  effective_fund_id TEXT;
  updated_dream_funds JSONB;
  v_new_version INTEGER;
BEGIN
  -- Auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to create_health_event_atomic';
  END IF;

  -- 🔧 Round 12 C1: INSERT first (dedup)
  INSERT INTO public.health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
  VALUES (p_user_id, p_event_type, p_vitality_change, 0, p_token_change, p_trigger_source, p_trigger_id, p_description, p_metadata)
  ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
  RETURNING id INTO event_id;

  -- If dedup (trigger_id exists), return early
  IF p_trigger_id IS NOT NULL AND event_id IS NULL THEN
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', true, 'deduplicated', true, 'eventId', NULL, 'newVitality', 72, 'newTokens', 156, 'version', 1);
    END IF;
    RETURN jsonb_build_object('success', true, 'deduplicated', true, 'eventId', NULL, 'newVitality', COALESCE(bs.vitality, 72), 'newTokens', COALESCE(bs.tokens, 156), 'version', COALESCE(bs.version, 1));
  END IF;

  -- Lock buddy_state
  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    -- 🔧 Round 21 H1 fix: auto-create 时显式指定 dream_funds (匹配 buddy-defaults.ts)
    INSERT INTO public.buddy_state (
      user_id, vitality, tokens, health, level, xp, xp_to_next,
      streak, dream_funds, badges, total_saved, challenges_completed,
      last_drain_at, updated_at
    ) VALUES (
      p_user_id, 72, 156, 'healthy', 1, 0, 100, 0,
      '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb,
      '[]'::jsonb, 0, 0, now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_new_vitality := LEAST(100, GREATEST(0, COALESCE(bs.vitality, 0) + p_vitality_change));
  v_new_tokens := GREATEST(0, COALESCE(bs.tokens, 0) + p_token_change);
  v_new_health := CASE WHEN v_new_vitality <= 0 THEN 'dormant' WHEN v_new_vitality <= 20 THEN 'critical' WHEN v_new_vitality <= 45 THEN 'weak' WHEN v_new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

  -- Dream fund update
  effective_fund_id := p_dream_fund_id;
  IF effective_fund_id = 'auto' OR effective_fund_id IS NULL THEN
    SELECT elem->>'id' INTO effective_fund_id
    FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)
    WHERE (elem->>'current')::numeric < (elem->>'target')::numeric
    LIMIT 1;
    IF effective_fund_id IS NULL THEN
      SELECT elem->>'id' INTO effective_fund_id FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem) LIMIT 1;
    END IF;
  END IF;

  IF effective_fund_id IS NOT NULL AND p_refund_amount > 0 THEN
    SELECT INTO updated_dream_funds
      COALESCE((SELECT jsonb_agg(CASE WHEN elem->>'id' = effective_fund_id THEN elem || jsonb_build_object('current', LEAST(COALESCE((elem->>'target')::numeric, 0), COALESCE((elem->>'current')::numeric, 0) + p_refund_amount)) ELSE elem END) FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)), COALESCE(bs.dream_funds, '[]'::jsonb));
  ELSE
    updated_dream_funds := COALESCE(bs.dream_funds, '[]'::jsonb);
  END IF;

  v_new_version := COALESCE(bs.version, 1) + 1;

  UPDATE public.buddy_state SET vitality = v_new_vitality, health = v_new_health, tokens = v_new_tokens, dream_funds = updated_dream_funds, total_saved = COALESCE(bs.total_saved, 0) + p_refund_amount, version = v_new_version, updated_at = now() WHERE user_id = p_user_id;

  -- Update health_event new_vitality
  UPDATE public.health_events SET new_vitality = v_new_vitality WHERE id = event_id;

  RETURN jsonb_build_object('success', true, 'deduplicated', false, 'eventId', event_id, 'newVitality', v_new_vitality, 'newTokens', v_new_tokens, 'dreamFunds', updated_dream_funds, 'totalSaved', COALESCE(bs.total_saved, 0) + p_refund_amount, 'version', v_new_version);
END;
$$;

REVOKE ALL ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO service_role;

COMMENT ON FUNCTION public.create_health_event_atomic IS
  'Round 25: restore 054 11-param signature + dedup + version bump + 063 dream_funds INSERT fix';
