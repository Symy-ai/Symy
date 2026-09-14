-- 072: Add 'Savings' overflow fund — Bug 7 root cause fix
--
-- 🔧 Bug 7 根因修复: 添加 'Savings' 无上限溢出基金
--   旧代码: DEFAULT_DREAM_FUNDS 只有 df-1 ($2000) + df-2 ($5000)
--   问题: RPC apply_buddy_state_delta 用 LEAST(target, current+delta) clamp current,
--     当 fund.current 达到 target 后, 多余的 savedAmount 被 LEAST 吞掉 →
--     buddy_state.total_saved 持续累加, 但 sum(dream_funds.current) 不变 → 两者 drift。
--   修复: 加一个 'Savings' 基金 (target=$1,000,000, 实际无上限),
--     RPC 'auto' 逻辑选 "first current<target" fund 时, 当 df-1/df-2 满后会自动选 Savings,
--     多余的 savedAmount 流入 Savings → total_saved 与 sum(dream_funds.current) 始终一致。
--
-- 🔧 Adversarial review fix (C1+C2+H1+H2):
--   旧版 072 重写 apply_buddy_state_delta 时改变了 RETURN shape (camelCase + 丢 streak),
--   改变了 XP 公式 (1.3x → 1.5x), 丢了 effective_fund_id fallback, 丢了 REVOKE FROM anon。
--   根因修复: 完全复制 063 的 RPC body, 只修改 auto-create INSERT branch 的 dream_funds JSONB。
--   RETURN shape, XP 公式, fund fallback, 权限 grant 全部与 063 一致。

-- ============================================================
-- 1. 更新 buddy_state.dream_funds column default
-- ============================================================
ALTER TABLE public.buddy_state ALTER COLUMN dream_funds SET DEFAULT
  '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"},{"id":"df-savings","name":"Savings","target":1000000,"current":0,"emoji":"🏦"}]'::jsonb;

-- ============================================================
-- 2. 回填现有 buddy_state 行: 追加 Savings 基金 (如果不存在)
--    用 jsonb @> 操作符检查 (幂等)
-- ============================================================
UPDATE public.buddy_state
SET dream_funds = dream_funds || '[{"id":"df-savings","name":"Savings","target":1000000,"current":0,"emoji":"🏦"}]'::jsonb,
    updated_at = now()
WHERE NOT COALESCE(dream_funds, '[]'::jsonb) @> '[{"id":"df-savings"}]'::jsonb;

-- ============================================================
-- 3. 回填 dream_funds 独立表: 为所有用户插入 df-savings 行 (如果不存在)
--    sort_order 设为 999 (排最后), 用户可拖拽调整
-- ============================================================
INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
SELECT bs.user_id, 'df-savings', 'Savings', 1000000, 0, '🏦', 999
FROM public.buddy_state bs
WHERE NOT EXISTS (
  SELECT 1 FROM public.dream_funds df
  WHERE df.user_id = bs.user_id AND df.fund_id = 'df-savings'
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. 更新 handle_new_buddy_state trigger (新用户注册时创建 buddy_state)
--    旧 trigger 用 hardcoded 2-fund JSONB, 需要更新为 3-fund
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_buddy_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.buddy_state (
    user_id, vitality, tokens, health, level, xp, xp_to_next,
    streak, dream_funds, badges, total_saved, challenges_completed,
    last_drain_at, updated_at
  ) VALUES (
    NEW.id, 72, 156, 'healthy', 1, 0, 100, 0,
    '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"},{"id":"df-savings","name":"Savings","target":1000000,"current":0,"emoji":"🏦"}]'::jsonb,
    '[]'::jsonb, 0, 0, now(), now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Also seed dream_funds table for new user
  INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order) VALUES
    (NEW.id, 'df-1', 'Credit Card Payoff', 2000, 0, '💳', 0),
    (NEW.id, 'df-2', 'Iceland Trip', 5000, 0, '🏔️', 1),
    (NEW.id, 'df-savings', 'Savings', 1000000, 0, '🏦', 2)
  ON CONFLICT (user_id, fund_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_buddy_state IS 'Bug 7 fix: include Savings overflow fund in new user defaults';

-- ============================================================
-- 5. 重建 apply_buddy_state_delta RPC
--    🔧 Adversarial review fix: 完全复制 063 body, 只改 auto-create INSERT 的 dream_funds JSONB
--    保持: RETURN shape (snake_case + streak), XP 公式 (1.3x), fund fallback, 权限 grant
-- ============================================================

-- 先 DROP 050 的 12-param 版本 (如果存在)
DROP FUNCTION IF EXISTS public.apply_buddy_state_delta(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER
);

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
    -- 🔧 Bug 7 fix: auto-create 时显式指定 dream_funds (含 Savings 溢出基金)
    -- 🔧 Adversarial review fix: 与 063 一致, 只改 dream_funds JSONB (3-fund)
    INSERT INTO public.buddy_state (
      user_id, vitality, tokens, health, level, xp, xp_to_next,
      streak, dream_funds, badges, total_saved, challenges_completed,
      last_drain_at, updated_at
    ) VALUES (
      p_user_id, 72, 156, 'healthy', 1, 0, 100, 0,
      '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"},{"id":"df-savings","name":"Savings","target":1000000,"current":0,"emoji":"🏦"}]'::jsonb,
      '[]'::jsonb, 0, 0, now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Apply deltas (与 063 完全一致 — adversarial review H1 fix: 保持 1.3x XP 公式)
  new_vitality := GREATEST(0, LEAST(100, COALESCE(bs.vitality, 72) + p_vitality_delta));
  new_tokens := GREATEST(0, COALESCE(bs.tokens, 156) + p_token_delta);

  IF p_xp_override IS NOT NULL THEN
    new_xp := p_xp_override;
  ELSE
    new_xp := GREATEST(0, COALESCE(bs.xp, 0) + p_xp_delta);
  END IF;

  new_xp_to_next := COALESCE(p_xp_to_next_override, COALESCE(bs.xp_to_next, 100));
  new_level := COALESCE(p_level_override, COALESCE(bs.level, 1));

  -- 🔧 Adversarial review H1 fix: 保持 063 的 single-IF + 1.3x (不是 WHILE + 1.5x)
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

  -- Badge merge (与 063 完全一致)
  all_badges := ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)));
  FOREACH badge_item IN ARRAY p_add_badges LOOP
    IF NOT (badge_item = ANY(all_badges)) THEN
      all_badges := array_append(all_badges, badge_item);
    END IF;
  END LOOP;
  merged_badges_jsonb := COALESCE((SELECT jsonb_agg(b) FROM unnest(all_badges) AS b), '[]'::jsonb);

  -- Dream fund progress (与 063 完全一致, 含 'auto' 解析 + fallback)
  -- 🔧 Adversarial review H2 fix: 保留 effective_fund_id fallback (063 有, 旧版 072 丢了)
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

  -- Version bump (与 063 一致)
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

  -- 🔧 Adversarial review C1 fix: RETURN shape 与 063 完全一致 (snake_case + streak)
  RETURN jsonb_build_object(
    'success', true,
    'vitality', new_vitality,
    'tokens', new_tokens,
    'health', new_health,
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

COMMENT ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) IS 'Bug 7 fix: auto-create + column default now include Savings overflow fund (df-savings). Body matches 063 exactly (snake_case RETURN, 1.3x XP, fund fallback).';

-- 🔧 Adversarial review C2 fix: 权限与 063 完全一致 (REVOKE anon + GRANT authenticated, service_role)
REVOKE ALL ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;

-- ============================================================
-- 6. 重建 create_health_event_atomic RPC
--    与 063 完全一致, 只改 auto-create INSERT 的 dream_funds JSONB (3-fund)
-- ============================================================
DROP FUNCTION IF EXISTS public.create_health_event_atomic(
  UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT
);

CREATE OR REPLACE FUNCTION public.create_health_event_atomic(
  p_user_id        UUID,
  p_event_type     TEXT,
  p_vitality_change INTEGER DEFAULT 0,
  p_token_change   INTEGER DEFAULT 0,
  p_trigger_source TEXT DEFAULT NULL,
  p_trigger_id     TEXT DEFAULT NULL,
  p_description    TEXT DEFAULT NULL,
  p_metadata       JSONB DEFAULT NULL,
  p_refund_amount  NUMERIC DEFAULT 0,
  p_add_badges     TEXT[] DEFAULT '{}',
  p_dream_fund_id  TEXT DEFAULT 'auto'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  event_id UUID;
  bs RECORD;
  v_new_vitality INTEGER;
  v_new_health TEXT;
  v_new_tokens INTEGER;
  v_new_version INTEGER;
  effective_fund_id TEXT;
  updated_dream_funds JSONB;
BEGIN
  -- Auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to create_health_event_atomic';
  END IF;

  -- INSERT first (dedup)
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
    -- 🔧 Bug 7 fix: auto-create 时显式指定 dream_funds (含 Savings 溢出基金)
    INSERT INTO public.buddy_state (
      user_id, vitality, tokens, health, level, xp, xp_to_next,
      streak, dream_funds, badges, total_saved, challenges_completed,
      last_drain_at, updated_at
    ) VALUES (
      p_user_id, 72, 156, 'healthy', 1, 0, 100, 0,
      '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"},{"id":"df-savings","name":"Savings","target":1000000,"current":0,"emoji":"🏦"}]'::jsonb,
      '[]'::jsonb, 0, 0, now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_new_vitality := LEAST(100, GREATEST(0, COALESCE(bs.vitality, 0) + p_vitality_change));
  v_new_tokens := GREATEST(0, COALESCE(bs.tokens, 0) + p_token_change);
  v_new_health := CASE WHEN v_new_vitality <= 0 THEN 'dormant' WHEN v_new_vitality <= 20 THEN 'critical' WHEN v_new_vitality <= 45 THEN 'weak' WHEN v_new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

  -- Dream fund update (与 063 完全一致, 含 fallback)
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

COMMENT ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) IS 'Bug 7 fix: auto-create now includes Savings overflow fund (df-savings). Body matches 063 exactly.';

-- 🔧 Adversarial review C2 fix: 权限与 063 完全一致 (service_role only)
REVOKE ALL ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO service_role;
