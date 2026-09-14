-- 071: Add auth guard to complete_challenge_atomic (Round 31)
--
-- 🔧 ARCH fix (Round 31 — complete_challenge_atomic 缺 auth guard):
--    migration 040 创建此 RPC 时 (Round 2), 未加 auth.uid() 检查。
--    043/048 已为 apply_buddy_state_delta / create_health_event_atomic / create_challenge_atomic /
--    resume_challenge_atomic 加了 auth guard, 但 complete_challenge_atomic 漏了。
--    任何 authenticated 用户可传 victim p_user_id 调此 RPC 完成他人挑战 + 获得奖励。
--    根因修复: 加 caller_uid := auth.uid() + cross-user check。
--    注意: 此函数已被 migration 065 重建 (恢复签名), 需再次完整重建。

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
  -- 🔧 Round 31 auth guard
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

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'cas_failed', true,
        'message', 'Challenge already completed',
        'current_status', challenge_row.status
      );
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Challenge not found or not owned by user'
      );
    END IF;
  END IF;

  -- ============================================================
  -- 2. Apply buddy_state delta (tokens, vitality, xp, etc.)
  -- ============================================================
  SELECT * INTO buddy_result FROM public.apply_buddy_state_delta(
    p_user_id,
    p_token_delta,
    p_vitality_delta,
    p_total_saved_delta,
    0,  -- streak delta
    p_xp_delta,
    0,  -- level delta
    p_challenges_delta,
    p_add_badges
  );

  IF buddy_result->>'success' IS NULL OR (buddy_result->>'success')::boolean = false THEN
    RAISE EXCEPTION 'apply_buddy_state_delta failed: %', buddy_result->>'error';
  END IF;

  -- ============================================================
  -- 3. Create health_event for challenge completion
  -- ============================================================
  INSERT INTO public.health_events (
    user_id, event_type, vitality_change, new_vitality,
    token_change, trigger_source, trigger_id, description, metadata
  ) VALUES (
    p_user_id,
    'challenge_reward',
    p_vitality_delta,
    (buddy_result->>'vitality')::int,
    p_token_delta,
    'chat_mcp',
    p_completed_trigger_id,
    p_completed_description,
    p_completed_metadata
  )
  ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
  RETURNING id INTO completed_event_id;

  -- ============================================================
  -- 4. Create health_event for reward (if separate trigger)
  -- ============================================================
  IF p_reward_trigger_id IS NOT NULL AND p_reward_trigger_id != p_completed_trigger_id THEN
    INSERT INTO public.health_events (
      user_id, event_type, vitality_change, new_vitality,
      token_change, trigger_source, trigger_id, description, metadata
    ) VALUES (
      p_user_id,
      'challenge_reward',
      0,
      (buddy_result->>'vitality')::int,
      0,
      'chat_mcp',
      p_reward_trigger_id,
      p_reward_description,
      p_reward_metadata
    )
    ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
    RETURNING id INTO reward_event_id;
  END IF;

  -- ============================================================
  -- 5. Return result
  -- ============================================================
  result_json := jsonb_build_object(
    'success', true,
    'cas_failed', false,
    'challengeId', p_challenge_id,
    'status', p_challenge_status,
    'completed_event_id', completed_event_id,
    'reward_event_id', reward_event_id,
    'tokens', (buddy_result->>'tokens')::int,
    'vitality', (buddy_result->>'vitality')::int,
    'level', (buddy_result->>'level')::int,
    'totalSaved', (buddy_result->>'totalSaved')::numeric,
    'dreamFunds', buddy_result->'dreamFunds'
  );

  RETURN result_json;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) IS 'Round 31: add auth guard (was missing since Round 2)';
