-- ============================================================
-- 113: Fix apply_buddy_state_delta RETURN type coercion
--
-- Bug: Migration 108 used "SELECT jsonb_build_object(...) INTO bs;"
-- where bs is a RECORD variable. PostgreSQL tries JSONB to RECORD
-- type coercion and fails with:
--   ERROR 22P02: invalid input syntax for type json
--   Token "(" is invalid
--
-- Fix: Use "RETURN jsonb_build_object(...)" directly.
-- Apply AFTER migrations 108-112.
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
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to apply_buddy_state_delta';
  END IF;

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

  effective_fund_id := p_dream_fund_id;
  IF effective_fund_id = 'auto' OR effective_fund_id IS NULL THEN
    SELECT fund_id INTO effective_fund_id
    FROM public.dream_funds
    WHERE user_id = p_user_id
      AND current < target
    ORDER BY sort_order ASC, created_at ASC
    LIMIT 1;

    IF effective_fund_id IS NULL THEN
      SELECT fund_id INTO effective_fund_id
      FROM public.dream_funds
      WHERE user_id = p_user_id
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  IF effective_fund_id IS NOT NULL AND p_dream_fund_amount != 0 THEN
    SELECT target, current INTO fund_target, fund_current
    FROM public.dream_funds
    WHERE user_id = p_user_id AND fund_id = effective_fund_id
    FOR UPDATE;

    IF fund_target IS NOT NULL THEN
      new_fund_current := LEAST(fund_target, GREATEST(0, fund_current + p_dream_fund_amount));

      UPDATE public.dream_funds
      SET current = new_fund_current, updated_at = now()
      WHERE user_id = p_user_id AND fund_id = effective_fund_id;

      UPDATE public.buddy_state
      SET version = version + 1, updated_at = now()
      WHERE user_id = p_user_id;

      new_version := new_version + 1;
    END IF;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) TO authenticated;
