-- ============================================================
-- 109: Fix apply_buddy_state_delta — `SELECT ... INTO bs` 类型冲突
--
-- Bug: Migration 108 重建了 apply_buddy_state_delta 移除对 bs.dream_funds
--       (已被 migration 103 删除) 的引用, 但引入了新 bug:
--       `SELECT jsonb_build_object(...) INTO bs;` 中 bs 是 RECORD 类型,
--       已被前面的 `SELECT * INTO bs FROM buddy_state` 赋值,
--       再 SELECT JSONB INTO 同一 RECORD 会触发类型冲突
--       → "invalid input syntax for type json" "Token ( is invalid"
--       → RPC 失败 → /api/buddy/deposit 失败
--
-- 修复: 直接 `RETURN jsonb_build_object(...)` (与 migration 050 模式一致)
--       不再 SELECT INTO bs.
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
SET search_path = public
AS $$
DECLARE
  caller_uid         UUID := auth.uid();
  bs                 RECORD;
  new_vitality       INTEGER;
  new_tokens         INTEGER;
  new_xp             INTEGER;
  new_xp_to_next     INTEGER;
  new_level          INTEGER;
  new_health         TEXT;
  new_total_saved    NUMERIC;
  new_challenges     INTEGER;
  all_badges         TEXT[];
  badge_item         TEXT;
  badges_jsonb       JSONB;
  effective_fund_id  TEXT;
  new_version        INTEGER;
  fund_target        NUMERIC;
  fund_current       NUMERIC;
  new_fund_current   NUMERIC;
BEGIN
  -- auth guard (service_role bypasses via NULL caller_uid)
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to apply_buddy_state_delta';
  END IF;

  -- 1. Lock buddy_state row for this user
  SELECT * INTO bs
  FROM public.buddy_state
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.buddy_state (
      user_id, vitality, tokens, health, level, xp, xp_to_next,
      streak, badges, total_saved, challenges_completed,
      last_drain_at, updated_at
    ) VALUES (
      p_user_id, 72, 156, 'healthy', 1, 0, 100, 0,
      '[]'::jsonb, 0, 0, now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- 2. Apply additive deltas
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

  new_version := COALESCE(bs.version, 1) + 1;

  -- 3. Update buddy_state (with version bump)
  UPDATE public.buddy_state
  SET
    vitality            = new_vitality,
    tokens              = new_tokens,
    health              = new_health,
    xp                  = new_xp,
    xp_to_next          = new_xp_to_next,
    level               = new_level,
    total_saved         = new_total_saved,
    challenges_completed = new_challenges,
    version             = new_version,
    updated_at          = now()
  WHERE user_id = p_user_id;

  -- 4. Badge awards (deduplicated)
  IF array_length(p_add_badges, 1) > 0 THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)))
    INTO all_badges;

    FOREACH badge_item IN ARRAY p_add_badges LOOP
      IF NOT (badge_item = ANY(all_badges)) THEN
        all_badges := array_append(all_badges, badge_item);
      END IF;
    END LOOP;

    SELECT COALESCE(jsonb_agg(b), '[]'::jsonb) INTO badges_jsonb
    FROM unnest(all_badges) AS b;

    UPDATE public.buddy_state
    SET badges = badges_jsonb, version = version + 1, updated_at = now()
    WHERE user_id = p_user_id;

    new_version := new_version + 1;
  END IF;

  -- 5. Dream fund progress — Round 108 fix: 直接更新 dream_funds 独立表
  --    (migration 103 删除了 buddy_state.dream_funds JSONB 列)
  effective_fund_id := p_dream_fund_id;
  IF effective_fund_id = 'auto' OR effective_fund_id IS NULL THEN
    -- 'auto': 选第一个未满的 fund
    SELECT fund_id INTO effective_fund_id
    FROM public.dream_funds
    WHERE user_id = p_user_id
      AND current < target
    ORDER BY sort_order ASC, created_at ASC
    LIMIT 1;

    IF effective_fund_id IS NULL THEN
      -- 所有 fund 都满了, 选 Savings (无上限)
      SELECT fund_id INTO effective_fund_id
      FROM public.dream_funds
      WHERE user_id = p_user_id
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  IF effective_fund_id IS NOT NULL AND p_dream_fund_amount != 0 THEN
    -- 获取当前 fund 的 target 和 current
    SELECT target, current INTO fund_target, fund_current
    FROM public.dream_funds
    WHERE user_id = p_user_id AND fund_id = effective_fund_id
    FOR UPDATE;

    IF fund_target IS NOT NULL THEN
      -- 计算新的 current (clamp to target)
      new_fund_current := LEAST(fund_target, GREATEST(0, fund_current + p_dream_fund_amount));

      -- 更新 dream_funds 独立表
      UPDATE public.dream_funds
      SET current = new_fund_current, updated_at = now()
      WHERE user_id = p_user_id AND fund_id = effective_fund_id;

      -- bump version
      UPDATE public.buddy_state
      SET version = version + 1, updated_at = now()
      WHERE user_id = p_user_id;

      new_version := new_version + 1;
    END IF;
  END IF;

  -- 6. Return updated state — 🔧 Round 109 fix: 直接 RETURN (不再 SELECT INTO bs)
  --    旧代码 (migration 108 bug): SELECT jsonb_build_object(...) INTO bs;
  --    问题: bs 是 RECORD 类型 (前面已被 SELECT * INTO bs FROM buddy_state 赋值),
  --          再 SELECT JSONB INTO 同一 RECORD → PostgreSQL 尝试 JSONB→RECORD 类型转换
  --          → "invalid input syntax for type json" "Token ( is invalid"
  --    修复: 直接 RETURN jsonb_build_object (与 migration 050 模式一致)
  RETURN jsonb_build_object(
    'success', true,
    'vitality', new_vitality,
    'tokens', new_tokens,
    'xp', new_xp,
    'xp_to_next', new_xp_to_next,
    'level', new_level,
    'health', new_health,
    'total_saved', new_total_saved,
    'challenges_completed', new_challenges,
    'version', new_version
  );
END;
$$;

COMMENT ON FUNCTION public.apply_buddy_state_delta IS 'Round 109: Fixed migration 108 regression — RETURN jsonb_build_object directly (was SELECT INTO bs RECORD causing type-coercion failure). Dream fund progress updates dream_funds table (not buddy_state.dream_funds JSONB which was dropped in migration 103).';

-- Re-grant permissions
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) TO authenticated;
