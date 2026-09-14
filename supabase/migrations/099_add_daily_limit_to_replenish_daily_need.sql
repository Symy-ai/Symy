-- ============================================================
-- 099_add_daily_limit_to_replenish_daily_need.sql
--
-- 🔧 Round 104: Add daily limit to replenish_daily_need RPC.
--
-- Problem: The RPC had no daily limit — users could call it repeatedly
-- to keep their needs at 100. The client-side Pet Symy button limits
-- to once per day, but the API was unprotected.
--
-- Fix: Add a daily cooldown check using the last_drain_at column.
-- The RPC now checks if the user has already replenished today.
-- If so, it returns the current needs without applying the replenish.
--
-- This is a soft limit — it doesn't raise an error, just no-ops.
-- The client should check the response to show appropriate UI.
-- ============================================================

CREATE OR REPLACE FUNCTION public.replenish_daily_need(
  p_user_id uuid,
  p_need_type text,
  p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_needs jsonb;
  v_current integer;
  v_new_value integer;
  v_last_replenish timestamptz;
  v_today text := date_trunc('day', now())::text;
  v_last_replenish_day text;
BEGIN
  IF p_need_type NOT IN ('clarity', 'connection', 'breath') THEN
    RAISE EXCEPTION 'Invalid need type: %', p_need_type;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive: %', p_amount;
  END IF;

  SELECT daily_needs, last_drain_at INTO v_needs, v_last_replenish
  FROM public.buddy_state
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN null;
  END IF;

  -- 🔧 Round 104: Daily limit — only allow replenish once per day per need type
  -- We use a JSONB field 'last_replenish_dates' to track per-need-type dates
  -- If already replenished today, return current needs without applying
  v_last_replenish_day := NULL;
  IF v_needs ? ('last_replenish_' || p_need_type) THEN
    v_last_replenish_day := v_needs->>('last_replenish_' || p_need_type);
  END IF;

  IF v_last_replenish_day = v_today THEN
    -- Already replenished today — return current needs (soft no-op)
    RETURN jsonb_build_object(
      'daily_needs', v_needs - ('last_replenish_' || p_need_type),
      'already_replenished_today', true
    );
  END IF;

  -- Apply the replenish
  v_current := COALESCE((v_needs->>p_need_type)::integer, 0);
  v_new_value := LEAST(100, v_current + p_amount);

  v_needs := jsonb_set(v_needs, ARRAY[p_need_type], to_jsonb(v_new_value));
  -- Track the replenish date for this need type
  v_needs := jsonb_set(v_needs, ARRAY['last_replenish_' || p_need_type], to_jsonb(v_today));

  UPDATE public.buddy_state
    SET daily_needs = v_needs, updated_at = now()
    WHERE user_id = p_user_id;

  -- Return the needs without the internal tracking fields
  v_needs := v_needs - 'last_replenish_clarity' - 'last_replenish_connection' - 'last_replenish_breath';
  RETURN jsonb_build_object(
    'daily_needs', v_needs,
    'already_replenished_today', false
  );
END;
$$;

COMMENT ON FUNCTION public.replenish_daily_need(uuid, text, integer) IS 'P1-5: Replenish a daily need. Round 104: Added daily limit — only one replenish per need type per day.';
