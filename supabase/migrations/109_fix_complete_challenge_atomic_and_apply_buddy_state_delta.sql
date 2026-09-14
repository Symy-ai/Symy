-- ============================================================
-- 109: Fix complete_challenge_atomic arg order (P0-2)
-- ============================================================
-- 🔧 2026-07-15 (ARCH-9 #2 / P0-2 修复)
--
-- Bug: Migration 071 rebuilt complete_challenge_atomic to add auth guard,
--   but used WRONG positional arg order when calling apply_buddy_state_delta:
--     Position 7: passed literal 0 (INTEGER) to p_add_badges TEXT[] → 42804
--     Position 9: passed p_add_badges (TEXT[]) to p_dream_fund_amount NUMERIC → 42804
--   Every call to complete_challenge_atomic fails with type error 42804.
--   Code falls back to 5-step flow (error message includes "does not exist"),
--   but this is a performance hit + non-atomic.
--
-- Note: apply_buddy_state_delta was already fixed by migration 108 (remote)
--   which removed dream_funds JSONB references. This migration only fixes
--   complete_challenge_atomic.
--
-- Fix: Rebuild complete_challenge_atomic with:
--   - 057's correct arg order (positional args match apply_buddy_state_delta signature)
--   - 071's auth guard (caller_uid check)
--   - No dream_funds JSONB references
--   - snake_case return shape (matches apply_buddy_state_delta return)
--
-- Safety: CREATE OR REPLACE is idempotent. Function signature unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_challenge_atomic(
  p_challenge_id UUID,
  p_user_id UUID,
  p_challenge_status TEXT DEFAULT 'passed',
  p_token_delta INTEGER DEFAULT 0,
  p_vitality_delta INTEGER DEFAULT 0,
  p_xp_delta INTEGER DEFAULT 0,
  p_challenges_delta INTEGER DEFAULT 0,
  p_add_badges TEXT[] DEFAULT '{}',
  p_total_saved_delta NUMERIC DEFAULT 0,
  p_dream_fund_id TEXT DEFAULT NULL,
  p_dream_fund_amount NUMERIC DEFAULT 0,
  p_completed_trigger_id TEXT DEFAULT NULL,
  p_completed_description TEXT DEFAULT NULL,
  p_completed_metadata JSONB DEFAULT '{}'::jsonb,
  p_reward_trigger_id TEXT DEFAULT NULL,
  p_reward_description TEXT DEFAULT NULL,
  p_reward_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  cas_rows_affected INTEGER := 0;
  challenge_row RECORD;
  buddy_result JSONB;
  completed_event_id UUID;
  reward_event_id UUID;
  result_json JSONB;
BEGIN
  -- 🔧 071 auth guard (preserved)
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to complete_challenge_atomic';
  END IF;

  -- ============================================================
  -- 1. CAS: 标记 challenge 为 passed/failed (仅当当前 status='active')
  -- ============================================================
  UPDATE public.active_challenges
  SET status = p_challenge_status, updated_at = now()
  WHERE id = p_challenge_id
    AND user_id = p_user_id
    AND status = 'active';

  GET DIAGNOSTICS cas_rows_affected = ROW_COUNT;

  IF cas_rows_affected = 0 THEN
    SELECT * INTO challenge_row FROM public.active_challenges
    WHERE id = p_challenge_id AND user_id = p_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'cas_failed', true,
      'current_status', challenge_row.status,
      'error', 'Challenge not found or not in active state'
    );
  END IF;

  IF p_challenge_status = 'failed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'cas_rows_affected', cas_rows_affected,
      'status', 'failed',
      'rewards_applied', false
    );
  END IF;

  -- ============================================================
  -- 2. applyBuddyStateDelta (atomic buddy_state update)
  -- 🔧 2026-07-15 (P0-2): CORRECT arg order (matches apply_buddy_state_delta signature)
  --    071 had wrong order: pos 4 was p_total_saved_delta (should be p_xp_delta),
  --    pos 7 was literal 0 (should be p_add_badges TEXT[]),
  --    pos 9 was p_add_badges (should be p_dream_fund_amount NUMERIC)
  -- ============================================================
  SELECT * INTO buddy_result FROM public.apply_buddy_state_delta(
    p_user_id,              -- 1: p_user_id
    p_token_delta,          -- 2: p_token_delta
    p_vitality_delta,       -- 3: p_vitality_delta
    p_xp_delta,             -- 4: p_xp_delta (was p_total_saved_delta in 071 — WRONG)
    p_challenges_delta,     -- 5: p_challenges_delta (was 0 in 071 — WRONG)
    p_total_saved_delta,    -- 6: p_total_saved_delta (was p_xp_delta in 071 — WRONG)
    p_add_badges,           -- 7: p_add_badges TEXT[] (was 0 in 071 — WRONG, type error)
    p_dream_fund_id,        -- 8: p_dream_fund_id (was p_challenges_delta in 071 — WRONG)
    p_dream_fund_amount,    -- 9: p_dream_fund_amount NUMERIC (was p_add_badges in 071 — WRONG, type error)
    NULL,                   -- 10: p_level_override
    NULL,                   -- 11: p_xp_to_next_override
    NULL                    -- 12: p_xp_override
  );

  IF (buddy_result->>'success')::boolean = false THEN
    RAISE EXCEPTION 'apply_buddy_state_delta failed: %', buddy_result->>'error';
  END IF;

  -- ============================================================
  -- 3. health_event: challenge_completed (审计记录)
  -- ============================================================
  IF p_completed_trigger_id IS NOT NULL THEN
    INSERT INTO public.health_events (
      user_id, event_type, vitality_change, new_vitality,
      token_change, trigger_source, trigger_id, description, metadata
    )
    VALUES (
      p_user_id, 'challenge_completed',
      0, (buddy_result->>'vitality')::integer, 0,
      'chat_mcp',
      p_completed_trigger_id, p_completed_description, p_completed_metadata
    )
    ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO completed_event_id;
  END IF;

  -- ============================================================
  -- 4. health_event: challenge_reward (if separate trigger)
  -- ============================================================
  IF p_reward_trigger_id IS NOT NULL AND p_reward_trigger_id != p_completed_trigger_id THEN
    INSERT INTO public.health_events (
      user_id, event_type, vitality_change, new_vitality,
      token_change, trigger_source, trigger_id, description, metadata
    )
    VALUES (
      p_user_id, 'challenge_reward',
      0, (buddy_result->>'vitality')::integer, 0,
      'chat_mcp',
      p_reward_trigger_id, p_reward_description, p_reward_metadata
    )
    ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO reward_event_id;
  END IF;

  -- ============================================================
  -- 5. Return result
  --    🔧 2026-07-15: snake_case field names (matches apply_buddy_state_delta return)
  --    071 used camelCase (totalSaved/dreamFunds) but apply_buddy_state_delta
  --    returns snake_case (total_saved) → 071's result had NULL for these fields
  -- ============================================================
  result_json := jsonb_build_object(
    'success', true,
    'cas_rows_affected', cas_rows_affected,
    'status', p_challenge_status,
    'rewards_applied', true,
    'tokens', (buddy_result->>'tokens')::integer,
    'vitality', (buddy_result->>'vitality')::integer,
    'level', (buddy_result->>'level')::integer,
    'total_saved', (buddy_result->>'total_saved')::numeric,
    'challenges_completed', (buddy_result->>'challenges_completed')::integer,
    'completed_event_id', completed_event_id,
    'reward_event_id', reward_event_id
  );

  RETURN result_json;
END;
$$;

-- Re-grant permissions (same as 071)
REVOKE ALL ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) IS
  '2026-07-15 (P0-2): Fixed arg order (071 had wrong positional args → 42804 type error). Added auth guard from 071. snake_case return shape.';
