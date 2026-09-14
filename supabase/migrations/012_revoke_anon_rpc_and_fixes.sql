-- ============================================================
-- 012: Revoke anon RPC access (BUG-204) + Fix refund_boost dream fund targeting (BUG-205)
--
-- BUG-204 (Critical): Both apply_buddy_state_delta and create_health_event_atomic
-- were GRANTed to anon role. These are SECURITY DEFINER functions that bypass RLS.
-- An unauthenticated user with the anon key could call these to modify any user's data.
--
-- BUG-205 (High): create_health_event_atomic refund_boost uses ordinality idx=1
-- to always credit the first dream fund (df-1). Should use id-based matching
-- like apply_buddy_state_delta does, to allow refund to go to specific funds.
-- ============================================================

-- ============================================================
-- 1. BUG-204: Revoke anon EXECUTE on both RPC functions
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.apply_buddy_state_delta FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_health_event_atomic FROM anon;

-- ============================================================
-- 2. BUG-205: Fix create_health_event_atomic refund_boost to use id-based matching
--    instead of ordinality idx=1. Now uses df-1 by default (consistent with
--    complete_challenge behavior), but the infrastructure supports adding
--    a p_dream_fund_id parameter in the future.
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
  p_new_badges      TEXT[] DEFAULT '{}',
  p_dream_fund_id   TEXT DEFAULT 'df-1'  -- 🔧 BUG-205: configurable fund target
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
  all_badges    TEXT[];
  badge_item    TEXT;
  badges_jsonb  JSONB;
  default_dream_funds CONSTANT JSONB := '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb;
  current_dream_funds JSONB;
  target_fund_id TEXT;
BEGIN
  -- Default fund target for refund_boost
  target_fund_id := COALESCE(p_dream_fund_id, 'df-1');

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

  -- BUG-186 fix: if dream_funds is empty, seed defaults
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
  -- 🔧 BUG-205 fix: Use id-based matching instead of ordinality idx
  -- ============================================================
  IF p_event_type = 'refund_boost' AND p_refund_amount > 0 THEN
    UPDATE public.buddy_state
    SET total_saved = COALESCE(total_saved, 0) + p_refund_amount
    WHERE user_id = p_user_id;

    -- Re-read dream_funds
    SELECT dream_funds INTO current_dream_funds
    FROM public.buddy_state
    WHERE user_id = p_user_id;

    current_dream_funds := CASE
      WHEN COALESCE(current_dream_funds, '[]'::jsonb) = '[]'::jsonb
      THEN default_dream_funds
      ELSE current_dream_funds
    END;

    -- 🔧 BUG-205: Use elem->>'id' = target_fund_id instead of ordinality idx=1
    SELECT INTO updated_dream_funds
      COALESCE(
        (SELECT jsonb_agg(
          CASE WHEN elem->>'id' = target_fund_id
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
        FROM jsonb_array_elements(current_dream_funds) AS arr(elem)),
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

-- Confirm permissions: only authenticated and service_role can execute
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) FROM anon;

-- Update comments
COMMENT ON FUNCTION public.apply_buddy_state_delta IS
  'Atomically applies deltas to buddy_state. BUG-186: auto-seeds default dream_funds. BUG-204: anon access revoked. Uses SELECT ... FOR UPDATE.';
COMMENT ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) IS
  'Atomically creates health events and updates buddy vitality. BUG-186: auto-seeds dream_funds. BUG-204: anon access revoked. BUG-205: id-based dream fund matching. Uses SELECT ... FOR UPDATE.';
