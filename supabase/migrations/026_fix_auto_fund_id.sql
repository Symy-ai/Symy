-- ============================================================
-- 026: Fix apply_buddy_state_delta — handle 'auto' fund_id (BUG-326)
-- ============================================================
-- 问题：complete_challenge 传 dream_fund_id='auto'，RPC SQL 用 elem->>'id' = 'auto' 匹配不到
-- 修复：SQL 层也处理 'auto' — 找第一个 current < target 的基金
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
  bs RECORD;
  new_tokens INTEGER;
  new_vitality INTEGER;
  new_xp INTEGER;
  new_level INTEGER;
  new_xp_to_next INTEGER;
  new_challenges INTEGER;
  new_total_saved NUMERIC;
  new_health TEXT;
  current_badges TEXT[];
  merged_badges TEXT[];
  updated_dream_funds JSONB;
  effective_fund_id TEXT;
BEGIN
  -- Lock the row for atomic update
  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    -- Auto-create if not exists
    INSERT INTO public.buddy_state (user_id, vitality, tokens, health, level, xp, xp_to_next, streak, dream_funds, badges, total_saved, challenges_completed)
    VALUES (p_user_id, 72, 156, 'healthy', 1, 0, 100, 0, '[{"id":"df-1","name":"Credit Card Payoff","target":3000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🇮🇸"}]'::jsonb, '[]', 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Calculate new values
  new_tokens := GREATEST(0, COALESCE(bs.tokens, 0) + p_token_delta);
  new_vitality := LEAST(100, GREATEST(0, COALESCE(bs.vitality, 0) + p_vitality_delta));
  new_xp := GREATEST(0, COALESCE(bs.xp, 0) + p_xp_delta);
  new_level := COALESCE(bs.level, 1);
  new_xp_to_next := COALESCE(bs.xp_to_next, 100);

  IF p_level_override IS NOT NULL THEN
    new_level := p_level_override;
  END IF;
  IF p_xp_to_next_override IS NOT NULL THEN
    new_xp_to_next := p_xp_to_next_override;
  END IF;
  IF p_xp_override IS NOT NULL THEN
    new_xp := p_xp_override;
  END IF;

  -- Level up check
  IF p_xp_override IS NULL AND p_xp_to_next_override IS NULL AND new_xp >= new_xp_to_next THEN
    new_xp := new_xp - new_xp_to_next;
    new_level := new_level + 1;
    new_xp_to_next := FLOOR(new_xp_to_next * 1.3)::INTEGER;
  END IF;

  new_challenges := GREATEST(0, COALESCE(bs.challenges_completed, 0) + p_challenges_delta);
  new_total_saved := GREATEST(0, COALESCE(bs.total_saved, 0) + p_total_saved_delta);
  new_health := CASE WHEN new_vitality <= 0 THEN 'dormant' WHEN new_vitality <= 20 THEN 'critical' WHEN new_vitality <= 45 THEN 'weak' WHEN new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

  -- Merge badges
  current_badges := COALESCE(bs.badges, '{}'::TEXT[]);
  merged_badges := ARRAY(SELECT DISTINCT unnest(current_badges || p_add_badges));

  -- ============================================================
  -- Dream fund progress
  -- ============================================================
  effective_fund_id := p_dream_fund_id;

  -- 🔧 BUG-326 fix: handle 'auto' — find first fund with current < target
  IF effective_fund_id = 'auto' THEN
    SELECT elem->>'id' INTO effective_fund_id
    FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)
    WHERE (elem->>'current')::numeric < (elem->>'target')::numeric
    LIMIT 1;

    -- If no incomplete fund, use first fund
    IF effective_fund_id IS NULL THEN
      SELECT elem->>'id' INTO effective_fund_id
      FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)
      LIMIT 1;
    END IF;
  END IF;

  IF effective_fund_id IS NOT NULL AND p_dream_fund_amount > 0 THEN
    SELECT INTO updated_dream_funds
      COALESCE(
        (SELECT jsonb_agg(
          CASE WHEN elem->>'id' = effective_fund_id
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
        FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)),
        COALESCE(bs.dream_funds, '[]'::jsonb)
      );
  ELSE
    updated_dream_funds := COALESCE(bs.dream_funds, '[]'::jsonb);
  END IF;

  -- Update the row
  UPDATE public.buddy_state
  SET
    tokens = new_tokens,
    vitality = new_vitality,
    health = new_health,
    level = new_level,
    xp = new_xp,
    xp_to_next = new_xp_to_next,
    challenges_completed = new_challenges,
    total_saved = new_total_saved,
    badges = merged_badges,
    dream_funds = updated_dream_funds,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'tokens', new_tokens,
    'vitality', new_vitality,
    'health', new_health,
    'level', new_level,
    'xp', new_xp,
    'xp_to_next', new_xp_to_next,
    'streak', COALESCE(bs.streak, 0),
    'dream_funds', updated_dream_funds,
    'badges', merged_badges,
    'total_saved', new_total_saved,
    'challenges_completed', new_challenges
  );
END;
$$;

-- Revoke anon, grant authenticated + service_role
REVOKE ALL ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_buddy_state_delta IS 'BUG-326: handle auto fund_id — find first incomplete fund';
