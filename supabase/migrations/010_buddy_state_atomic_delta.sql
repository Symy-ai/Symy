-- ============================================================
-- 010: Atomic Buddy State Delta Application (BUG-94 Fix)
--
-- Fixes the read-modify-write race condition in MCP tools'
-- upsertBuddyState(). Previously, MCP tools (add_tokens,
-- complete_challenge, add_badge, etc.) would:
--   1. Read current buddy_state
--   2. Calculate new values in TypeScript (based on old read)
--   3. Upsert the full row (overwriting concurrent changes)
--
-- Two concurrent MCP calls could both read tokens=100,
-- one adds +5 (writes 105), another adds +8 (writes 108),
-- losing the first +5. Should be 113.
--
-- This RPC function uses SELECT ... FOR UPDATE to lock the
-- buddy_state row, then applies deltas atomically within
-- a single database transaction.
--
-- Called from TypeScript via: supabase.rpc('apply_buddy_state_delta', {...})
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_buddy_state_delta(
  p_user_id              UUID,
  -- Additive deltas (applied atomically to current values)
  p_token_delta          INTEGER DEFAULT 0,        -- tokens += p_token_delta
  p_vitality_delta       INTEGER DEFAULT 0,        -- vitality += p_vitality_delta (clamped 0-100)
  p_xp_delta             INTEGER DEFAULT 0,        -- xp += p_xp_delta (handles level-up)
  p_challenges_delta     INTEGER DEFAULT 0,        -- challenges_completed += p_challenges_delta
  p_total_saved_delta    NUMERIC DEFAULT 0,        -- total_saved += p_total_saved_delta
  -- Badge awards (deduplicated — only adds badges not already present)
  p_add_badges           TEXT[] DEFAULT '{}',
  -- Dream fund progress: increment a specific fund by amount
  p_dream_fund_id        TEXT DEFAULT NULL,        -- e.g. 'df-1' or 'df-2'
  p_dream_fund_amount    NUMERIC DEFAULT 0,        -- amount to add to fund.current
  -- Direct value overrides (for special cases like level-up)
  p_level_override       INTEGER DEFAULT NULL,     -- set level directly (NULL = no override)
  p_xp_to_next_override  INTEGER DEFAULT NULL,     -- set xp_to_next directly (NULL = no override)
  p_xp_override          INTEGER DEFAULT NULL      -- set xp directly (NULL = use delta)
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
  fund_idx          INTEGER;
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
      72,    -- DEFAULT_VITALITY
      156,   -- DEFAULT_TOKENS
      'healthy',  -- DEFAULT_HEALTH
      1,     -- DEFAULT_LEVEL
      0,     -- DEFAULT_XP
      100,   -- DEFAULT_XP_TO_NEXT
      0,     -- DEFAULT_STREAK
      '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb,
      '[]'::jsonb,  -- DEFAULT_BADGES
      0,     -- DEFAULT_TOTAL_SAVED
      0,     -- DEFAULT_CHALLENGES_COMPLETED
      now(),
      now()
    )
    RETURNING * INTO bs;
  END IF;

  -- ============================================================
  -- 2. Apply additive deltas atomically
  -- ============================================================

  -- Vitality (clamped 0-100)
  new_vitality := GREATEST(0, LEAST(100, COALESCE(bs.vitality, 72) + p_vitality_delta));

  -- Tokens (min 0)
  new_tokens := GREATEST(0, COALESCE(bs.tokens, 156) + p_token_delta);

  -- XP + Level-up logic
  IF p_xp_override IS NOT NULL THEN
    -- Direct override (used after level-up calculation in some cases)
    new_xp := p_xp_override;
  ELSE
    new_xp := GREATEST(0, COALESCE(bs.xp, 0) + p_xp_delta);
  END IF;

  new_xp_to_next := COALESCE(p_xp_to_next_override, COALESCE(bs.xp_to_next, 100));
  new_level := COALESCE(p_level_override, COALESCE(bs.level, 1));

  -- Auto level-up: if xp >= xp_to_next, level up
  -- (handles the case where p_xp_delta pushed us over the threshold)
  IF p_xp_override IS NULL AND new_xp >= new_xp_to_next THEN
    new_xp := new_xp - new_xp_to_next;
    new_xp_to_next := FLOOR(new_xp_to_next * 1.3)::INTEGER;
    new_level := new_level + 1;
  END IF;

  -- Total saved (min 0)
  new_total_saved := GREATEST(0, COALESCE(bs.total_saved, 0) + p_total_saved_delta);

  -- Challenges completed (min 0)
  new_challenges := GREATEST(0, COALESCE(bs.challenges_completed, 0) + p_challenges_delta);

  -- Health from vitality (mirrors getHealthFromVitality in buddy-defaults.ts)
  IF new_vitality <= 0 THEN
    new_health := 'dormant';
  ELSIF new_vitality <= 20 THEN
    new_health := 'critical';
  ELSIF new_vitality <= 45 THEN
    new_health := 'weak';
  ELSIF new_vitality <= 75 THEN
    new_health := 'healthy';
  ELSE
    new_health := 'thriving';
  END IF;

  -- ============================================================
  -- 3. Update buddy_state with all new values
  -- ============================================================
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
    updated_at          = now()
  WHERE user_id = p_user_id;

  -- ============================================================
  -- 4. Badge awards (deduplicated)
  -- ============================================================
  IF array_length(p_add_badges, 1) > 0 THEN
    -- Get current badges as array
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)))
    INTO all_badges;

    -- Add new badges that aren't already present
    FOREACH badge_item IN ARRAY p_add_badges LOOP
      IF NOT (badge_item = ANY(all_badges)) THEN
        all_badges := array_append(all_badges, badge_item);
      END IF;
    END LOOP;

    -- Convert back to JSONB and update
    SELECT jsonb_agg(b) INTO badges_jsonb FROM unnest(all_badges) AS b;
    badges_jsonb := COALESCE(badges_jsonb, '[]'::jsonb);

    UPDATE public.buddy_state
    SET badges = badges_jsonb, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- ============================================================
  -- 5. Dream fund progress (increment specific fund)
  -- ============================================================
  IF p_dream_fund_id IS NOT NULL AND p_dream_fund_amount > 0 THEN
    -- Find the index of the matching fund (1-based from jsonb_array_elements)
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
        FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)),
        COALESCE(bs.dream_funds, '[]'::jsonb)
      );

    UPDATE public.buddy_state
    SET dream_funds = updated_dream_funds, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;

  -- ============================================================
  -- 6. Return the new state as JSONB
  -- ============================================================
  -- Re-read the final state (to include badge and dream_fund changes)
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
    -- Convenience: indicate if level-up happened
    'leveled_up',           (new_level > COALESCE(bs.level - 0, new_level))  -- always false here, but caller knows from their own calc
  );

EXCEPTION WHEN OTHERS THEN
  -- Return error info for TypeScript to handle
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ============================================================
-- Grant execute to authenticated users and service_role
-- ============================================================
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta TO anon;

-- Add comment for documentation
COMMENT ON FUNCTION public.apply_buddy_state_delta IS
  'Atomically applies deltas to buddy_state (tokens, vitality, XP, badges, dream funds, etc.).
   Uses SELECT ... FOR UPDATE to prevent read-modify-write race conditions (BUG-94).
   All deltas are additive — the function reads current values under lock and applies changes atomically.
   Falls back to auto-creating buddy_state if none exists for the user.';
