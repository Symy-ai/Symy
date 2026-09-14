-- ============================================================
-- 008: Atomic Health Event Creation (BUG-71 Fix)
--
-- Fixes the read-modify-write race condition in createHealthEvent().
-- Previously, two concurrent calls could both read the same
-- buddy_state.vitality, calculate different new values, and
-- the last write wins — losing the other's update.
--
-- This RPC function uses SELECT ... FOR UPDATE to lock the
-- buddy_state row, ensuring all operations are atomic within
-- a single database transaction.
--
-- Called from TypeScript via: supabase.rpc('create_health_event_atomic', {...})
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
  -- Refund-boost specific fields (0 for other event types)
  p_refund_amount   NUMERIC DEFAULT 0,
  -- Badge awards: pass in new badges to add (empty array if none)
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
    INSERT INTO public.buddy_state (user_id, vitality, tokens, health, level, xp, xp_to_next, streak, dream_funds, badges, total_saved, challenges_completed, last_drain_at, updated_at)
    VALUES (
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
  -- 2. Calculate new values atomically
  -- ============================================================
  new_vitality := GREATEST(0, LEAST(100, COALESCE(bs.vitality, 72) + p_vitality_change));
  new_tokens   := GREATEST(0, COALESCE(bs.tokens, 156) + p_token_change);

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
  -- 3. Build update data
  -- ============================================================
  -- Base update
  UPDATE public.buddy_state
  SET
    vitality   = new_vitality,
    tokens     = new_tokens,
    health     = new_health,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Refund-boost: also update total_saved and dream_funds
  IF p_event_type = 'refund_boost' AND p_refund_amount > 0 THEN
    -- Update total_saved (atomic increment)
    UPDATE public.buddy_state
    SET total_saved = COALESCE(total_saved, 0) + p_refund_amount
    WHERE user_id = p_user_id;

    -- Update first dream fund's current amount (atomic JSONB update)
    -- Logic: dream_funds[0].current = min(dream_funds[0].target, dream_funds[0].current + refund_amount)
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
        FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) WITH ORDINALITY AS arr(elem, idx)),
        COALESCE(bs.dream_funds, '[]'::jsonb)
      );

    UPDATE public.buddy_state
    SET dream_funds = updated_dream_funds
    WHERE user_id = p_user_id;
  END IF;

  -- Badge awards: merge new badges into existing
  IF array_length(p_new_badges, 1) > 0 THEN
    -- Get current badges as array
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)))
    INTO all_badges;

    -- Add new badges that aren't already present
    FOREACH badge_item IN ARRAY p_new_badges LOOP
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
  -- 4. Insert health_event record
  -- ============================================================
  INSERT INTO public.health_events (
    user_id, event_type, vitality_change, new_vitality,
    token_change, trigger_source, trigger_id, description, metadata
  ) VALUES (
    p_user_id, p_event_type, p_vitality_change, new_vitality,
    p_token_change, p_trigger_source, p_trigger_id, p_description, p_metadata
  ) RETURNING id INTO event_id;

  -- ============================================================
  -- 5. Return result as JSONB
  -- ============================================================
  RETURN jsonb_build_object(
    'success',      true,
    'event_id',     event_id,
    'vitality_change', p_vitality_change,
    'new_vitality', new_vitality,
    'token_change', p_token_change,
    'new_tokens',   new_tokens,
    'new_health',   new_health
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
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic TO anon;

-- ============================================================
-- Add trigger_id uniqueness constraint for idempotency
-- (Prevents duplicate health events if the same trigger_id
--  is processed twice, e.g. receipt refund double-click)
-- ============================================================

-- Partial unique index: only enforce uniqueness when trigger_id is non-null
-- This allows multiple events with NULL trigger_id (passive_recovery, drain, etc.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_events_unique_trigger
  ON public.health_events (user_id, trigger_source, trigger_id)
  WHERE trigger_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON FUNCTION public.create_health_event_atomic IS
  'Atomically creates a health event and updates buddy_state vitality/tokens.
   Uses SELECT ... FOR UPDATE to prevent read-modify-write race conditions (BUG-71).
   TypeScript pre-calculates vitality_change and token_change, this function
   applies them atomically within a single database transaction.';
