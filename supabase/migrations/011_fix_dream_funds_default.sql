-- ============================================================
-- 011: Fix Dream Funds Default Value + RPC Auto-Seed (BUG-186)
--
-- 问题: buddy_state.dream_funds 的 SQL 默认值是 '[]'（空数组），
-- 但 RPC 函数 apply_buddy_state_delta 和 create_health_event_atomic
-- 只能 UPDATE 已有的 dream_funds 元素，无法往空数组里添加。
-- jsonb_array_elements([]) 返回 0 行 → jsonb_agg 返回 NULL → COALESCE 回到 []
-- 结果: AI 调用 add_dream_fund_progress 时，空数组上的更新静默失败，
-- Dream Funds 永远为 $0。
--
-- 修复:
-- 1. 修改 buddy_state.dream_funds 默认值为正确的 JSON（含两个默认基金）
-- 2. 修改 handle_new_buddy_state 触发器，插入时使用默认基金
-- 3. 修改两个 RPC 函数，空 dream_funds 时自动种子默认值
-- 4. 回填所有已有空 dream_funds 的行
-- ============================================================

-- ============================================================
-- 1. 修改 buddy_state.dream_funds 列默认值
-- ============================================================
ALTER TABLE public.buddy_state
  ALTER COLUMN dream_funds SET DEFAULT
  '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb;

-- ============================================================
-- 2. 回填所有已有空 dream_funds 的行
-- ============================================================
UPDATE public.buddy_state
SET dream_funds = '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb
WHERE dream_funds = '[]'::jsonb
   OR dream_funds IS NULL;

-- ============================================================
-- 3. 修改 handle_new_buddy_state 触发器（显式插入默认基金）
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_buddy_state()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.buddy_state (user_id, dream_funds)
  VALUES (
    new.id,
    '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. 修改 apply_buddy_state_delta RPC — 空 dream_funds 时自动种子
-- ============================================================
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
AS $$
DECLARE
  bs                RECORD;
  new_vitality      INTEGER;
  new_tokens        INTEGER;
  new_xp            INTEGER;
  new_xp_to_next    INTEGER;
  new_level         INTEGER;
  new_health        TEXT;
  new_total_saved   NUMERIC;
  new_challenges    INTEGER;
  updated_dream_funds JSONB;
  all_badges        TEXT[];
  badge_item        TEXT;
  badges_jsonb      JSONB;
  default_dream_funds CONSTANT JSONB := '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb;
  current_dream_funds JSONB;
BEGIN
  -- ============================================================
  -- 1. Lock buddy_state row for this user (prevents concurrent writes)
  -- ============================================================
  SELECT * INTO bs
  FROM public.buddy_state
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- If no buddy_state row exists, create one with defaults
  IF NOT FOUND THEN
    INSERT INTO public.buddy_state (
      user_id, vitality, tokens, health, level, xp, xp_to_next,
      streak, dream_funds, badges, total_saved, challenges_completed,
      last_drain_at, updated_at
    ) VALUES (
      p_user_id,
      72, 156, 'healthy', 1, 0, 100, 0,
      default_dream_funds,
      '[]'::jsonb, 0, 0, now(), now()
    )
    RETURNING * INTO bs;
  END IF;

  -- ============================================================
  -- 🔧 BUG-186 fix: 如果 dream_funds 为空，种子默认值
  -- ============================================================
  IF COALESCE(bs.dream_funds, '[]'::jsonb) = '[]'::jsonb THEN
    UPDATE public.buddy_state
    SET dream_funds = default_dream_funds, updated_at = now()
    WHERE user_id = p_user_id;
    bs.dream_funds := default_dream_funds;
  END IF;

  -- ============================================================
  -- 2. Apply additive deltas atomically
  -- ============================================================
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

  new_total_saved := GREATEST(0, COALESCE(bs.total_saved, 0) + p_total_saved_delta);
  new_challenges := GREATEST(0, COALESCE(bs.challenges_completed, 0) + p_challenges_delta);

  IF new_vitality <= 0 THEN new_health := 'dormant';
  ELSIF new_vitality <= 20 THEN new_health := 'critical';
  ELSIF new_vitality <= 45 THEN new_health := 'weak';
  ELSIF new_vitality <= 75 THEN new_health := 'healthy';
  ELSE new_health := 'thriving';
  END IF;

  -- ============================================================
  -- 3. Update buddy_state with all new values
  -- ============================================================
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
    updated_at = now()
  WHERE user_id = p_user_id;

  -- ============================================================
  -- 4. Badge awards (deduplicated)
  -- ============================================================
  IF array_length(p_add_badges, 1) > 0 THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)))
    INTO all_badges;

    FOREACH badge_item IN ARRAY p_add_badges LOOP
      IF NOT (badge_item = ANY(all_badges)) THEN
        all_badges := array_append(all_badges, badge_item);
      END IF;
    END LOOP;

    SELECT jsonb_agg(b) INTO badges_jsonb FROM unnest(all_badges) AS b;
    badges_jsonb := COALESCE(badges_jsonb, '[]'::jsonb);

    UPDATE public.buddy_state
    SET badges = badges_jsonb, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- ============================================================
  -- 5. Dream fund progress (increment specific fund)
  -- 🔧 BUG-186 fix: 使用已种子过的 dream_funds（步骤 1 保证非空）
  -- ============================================================
  IF p_dream_fund_id IS NOT NULL AND p_dream_fund_amount > 0 THEN
    -- Re-read dream_funds (might have been seeded in step 1)
    SELECT dream_funds INTO current_dream_funds
    FROM public.buddy_state
    WHERE user_id = p_user_id;

    -- Final safety: if still empty, use defaults
    current_dream_funds := CASE
      WHEN COALESCE(current_dream_funds, '[]'::jsonb) = '[]'::jsonb
      THEN default_dream_funds
      ELSE current_dream_funds
    END;

    SELECT INTO updated_dream_funds
      COALESCE(
        (SELECT jsonb_agg(
          CASE WHEN elem->>'id' = p_dream_fund_id
            THEN elem || jsonb_build_object(
              'current',
              LEAST(
                COALESCE((elem->>'target')::numeric, 0),
                COALESCE((elem->>'current')::numeric, 0) + p_dream_fund_amount
              )
            )
            ELSE elem
          END
        )
        FROM jsonb_array_elements(current_dream_funds) AS arr(elem)),
        current_dream_funds
      );

    UPDATE public.buddy_state
    SET dream_funds = updated_dream_funds, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- ============================================================
  -- 6. Return the new state as JSONB
  -- ============================================================
  SELECT * INTO bs
  FROM public.buddy_state
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success',              true,
    'vitality',             bs.vitality,
    'tokens',               bs.tokens,
    'health',               bs.health,
    'level',                bs.level,
    'xp',                   bs.xp,
    'xp_to_next',           bs.xp_to_next,
    'streak',               bs.streak,
    'dream_funds',          bs.dream_funds,
    'badges',               bs.badges,
    'total_saved',          bs.total_saved,
    'challenges_completed', bs.challenges_completed,
    'last_drain_at',        bs.last_drain_at,
    'updated_at',           bs.updated_at,
    'leveled_up',           false
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ============================================================
-- 5. 修改 create_health_event_atomic RPC — refund_boost 空 funds 处理
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_health_event_atomic(
  p_user_id         UUID,
  p_event_type      TEXT,
  p_vitality_change INTEGER,
  p_token_change    INTEGER,
  p_trigger_source  TEXT,
  p_trigger_id      TEXT,
  p_description     TEXT,
  p_metadata        JSONB DEFAULT '{}',
  p_refund_amount   NUMERIC DEFAULT 0,
  p_new_badges      TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  bs            RECORD;
  new_vitality  INTEGER;
  new_tokens    INTEGER;
  new_health    TEXT;
  event_id      UUID;
  updated_dream_funds JSONB;
  fund_elem     JSONB;
  fund_idx      INTEGER;
  all_badges    TEXT[];
  badge_item    TEXT;
  badges_jsonb  JSONB;
  default_dream_funds CONSTANT JSONB := '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb;
  current_dream_funds JSONB;
BEGIN
  -- ============================================================
  -- 1. Lock buddy_state row
  -- ============================================================
  SELECT * INTO bs
  FROM public.buddy_state
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.buddy_state (user_id, vitality, tokens, health, level, xp, xp_to_next, streak, dream_funds, badges, total_saved, challenges_completed, last_drain_at, updated_at)
    VALUES (
      p_user_id,
      72, 156, 'healthy', 1, 0, 100, 0,
      default_dream_funds,
      '[]'::jsonb, 0, 0, now(), now()
    )
    RETURNING * INTO bs;
  END IF;

  -- 🔧 BUG-186 fix: 如果 dream_funds 为空，种子默认值
  IF COALESCE(bs.dream_funds, '[]'::jsonb) = '[]'::jsonb THEN
    UPDATE public.buddy_state
    SET dream_funds = default_dream_funds, updated_at = now()
    WHERE user_id = p_user_id;
    bs.dream_funds := default_dream_funds;
  END IF;

  -- ============================================================
  -- 2. Calculate new vitality and tokens
  -- ============================================================
  new_vitality := GREATEST(0, LEAST(100, COALESCE(bs.vitality, 72) + p_vitality_change));
  new_tokens := GREATEST(0, COALESCE(bs.tokens, 156) + p_token_change);

  IF new_vitality <= 0 THEN new_health := 'dormant';
  ELSIF new_vitality <= 20 THEN new_health := 'critical';
  ELSIF new_vitality <= 45 THEN new_health := 'weak';
  ELSIF new_vitality <= 75 THEN new_health := 'healthy';
  ELSE new_health := 'thriving';
  END IF;

  -- ============================================================
  -- 3. Update buddy_state
  -- ============================================================
  UPDATE public.buddy_state
  SET
    vitality   = new_vitality,
    tokens     = new_tokens,
    health     = new_health,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- ============================================================
  -- 4. Refund-boost: also update total_saved and dream_funds
  -- 🔧 BUG-186 fix: 使用已种子过的 dream_funds
  -- ============================================================
  IF p_event_type = 'refund_boost' AND p_refund_amount > 0 THEN
    UPDATE public.buddy_state
    SET total_saved = COALESCE(total_saved, 0) + p_refund_amount
    WHERE user_id = p_user_id;

    -- Re-read dream_funds (might have been seeded)
    SELECT dream_funds INTO current_dream_funds
    FROM public.buddy_state
    WHERE user_id = p_user_id;

    current_dream_funds := CASE
      WHEN COALESCE(current_dream_funds, '[]'::jsonb) = '[]'::jsonb
      THEN default_dream_funds
      ELSE current_dream_funds
    END;

    SELECT INTO updated_dream_funds
      COALESCE(
        (SELECT jsonb_agg(
          CASE WHEN idx = 1
            THEN elem || jsonb_build_object(
              'current',
              LEAST(
                COALESCE((elem->>'target')::numeric, 0),
                COALESCE((elem->>'current')::numeric, 0) + p_refund_amount
              )
            )
            ELSE elem
          END
        )
        FROM jsonb_array_elements(current_dream_funds) WITH ORDINALITY AS arr(elem, idx)),
        current_dream_funds
      );

    UPDATE public.buddy_state
    SET dream_funds = updated_dream_funds
    WHERE user_id = p_user_id;
  END IF;

  -- ============================================================
  -- 5. Badge awards
  -- ============================================================
  IF array_length(p_new_badges, 1) > 0 THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)))
    INTO all_badges;

    FOREACH badge_item IN ARRAY p_new_badges LOOP
      IF NOT (badge_item = ANY(all_badges)) THEN
        all_badges := array_append(all_badges, badge_item);
      END IF;
    END LOOP;

    SELECT jsonb_agg(b) INTO badges_jsonb FROM unnest(all_badges) AS b;
    badges_jsonb := COALESCE(badges_jsonb, '[]'::jsonb);

    UPDATE public.buddy_state
    SET badges = badges_jsonb, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- ============================================================
  -- 6. Create health_event record
  -- ============================================================
  INSERT INTO public.health_events (user_id, event_type, vitality_change, token_change, trigger_source, trigger_id, description, metadata, new_vitality, new_tokens)
  VALUES (
    p_user_id, p_event_type, p_vitality_change, p_token_change,
    p_trigger_source, p_trigger_id, p_description, p_metadata,
    new_vitality, new_tokens
  )
  RETURNING id INTO event_id;

  -- ============================================================
  -- 7. Return result
  -- ============================================================
  RETURN jsonb_build_object(
    'success',        true,
    'event_id',       event_id,
    'vitality_change', p_vitality_change,
    'new_vitality',   new_vitality,
    'token_change',   p_token_change,
    'new_tokens',     new_tokens
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ============================================================
-- 6. 恢复 GRANT 权限（CREATE OR REPLACE 会保留，但显式确认）
-- ============================================================
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta TO service_role;
-- 🔧 BUG-204 fix: REVOKE anon access — SECURITY DEFINER functions must not be callable by unauthenticated users
REVOKE EXECUTE ON FUNCTION public.apply_buddy_state_delta FROM anon;

GRANT EXECUTE ON FUNCTION public.create_health_event_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic TO service_role;
-- 🔧 BUG-204 fix: REVOKE anon access — same reason as above
REVOKE EXECUTE ON FUNCTION public.create_health_event_atomic FROM anon;

-- ============================================================
-- 7. 更新注释
-- ============================================================
COMMENT ON FUNCTION public.apply_buddy_state_delta IS
  'Atomically applies deltas to buddy_state. BUG-186 fix: auto-seeds default dream_funds when empty. Uses SELECT ... FOR UPDATE to prevent race conditions.';

COMMENT ON FUNCTION public.create_health_event_atomic IS
  'Atomically creates health events and updates buddy vitality. BUG-186 fix: auto-seeds default dream_funds for refund_boost when empty. Uses SELECT ... FOR UPDATE.';
