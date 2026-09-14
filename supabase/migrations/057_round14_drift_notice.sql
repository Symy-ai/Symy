-- Migration 057: Round 14 — drift guard RAISE NOTICE (ADV-R13-9)
--
-- 🔧 ARCH fix (Round 14 ADV-R13-9):
--    migration 055 的 drift guard (WHERE v_new_current <= df.target) 在 drift 时静默跳过 UPDATE
--    → ops 无排查线索, 只能从用户上报"挑战通过但 dream fund 进度没更新"才能发现
--    根因修复: drift 时 RAISE NOTICE 留排查线索 (不抛错, 不影响事务)
--
-- 注: 使用与 040/055 完全相同的 17 参签名, CREATE OR REPLACE 替换而非创建 overload

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
  cas_rows_affected INTEGER := 0;
  challenge_row RECORD;
  buddy_result JSONB;
  completed_event_id UUID;
  reward_event_id UUID;
  result_json JSONB;
  v_new_current NUMERIC;
  v_drift_rows_affected INTEGER;  -- 🔧 R14 ADV-R13-9: drift detection
BEGIN
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
  -- ============================================================
  SELECT * INTO buddy_result FROM public.apply_buddy_state_delta(
    p_user_id,
    p_token_delta,
    p_vitality_delta,
    p_xp_delta,
    p_challenges_delta,
    p_total_saved_delta,
    p_add_badges,
    p_dream_fund_id,
    p_dream_fund_amount,
    NULL, NULL, NULL
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
  -- 4. health_event: challenge_reward (dream fund progress)
  -- ============================================================
  IF p_reward_trigger_id IS NOT NULL THEN
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
  -- 5. dream_funds 独立表同步 (单事务内, 与 buddy_state 一致)
  -- 🔧 R13 BUG-15 + R14 ADV-R13-9: WHERE guard + RAISE NOTICE drift detection
  -- ============================================================
  IF p_dream_fund_id IS NOT NULL AND p_dream_fund_amount > 0 THEN
    SELECT (elem->>'current')::numeric INTO v_new_current
    FROM jsonb_array_elements((buddy_result->'dream_funds')::jsonb) AS arr(elem)
    WHERE elem->>'id' = p_dream_fund_id
    LIMIT 1;

    UPDATE public.dream_funds df
    SET current = v_new_current
    WHERE df.user_id = p_user_id
      AND df.fund_id = p_dream_fund_id
      AND v_new_current IS NOT NULL
      AND v_new_current <= df.target;

    -- 🔧 R14 ADV-R13-9 + ADV-R14-7: drift detection — 0 rows affected = drift
    --    场景 1: v_new_current > df.target (JSONB target 与表 target 不一致)
    --    场景 2: v_new_current IS NULL (fund_id 在 buddy_result.dream_funds 中找不到)
    GET DIAGNOSTICS v_drift_rows_affected = ROW_COUNT;
    IF v_drift_rows_affected = 0 THEN
      IF v_new_current IS NULL THEN
        RAISE NOTICE 'drift detected: complete_challenge_atomic — fund_id % not found in buddy_result.dream_funds (user=%)',
          p_dream_fund_id, p_user_id;
      ELSE
        RAISE NOTICE 'drift detected: complete_challenge_atomic skipped dream_funds UPDATE — user=% fund_id=% new_current=% (exceeds table target)',
          p_user_id, p_dream_fund_id, v_new_current;
      END IF;
    END IF;
  END IF;

  -- ============================================================
  -- 返回结果 (与 040 完全一致, camelCase 字段名)
  -- ============================================================
  result_json := jsonb_build_object(
    'success', true,
    'cas_rows_affected', cas_rows_affected,
    'status', p_challenge_status,
    'rewards_applied', true,
    'tokens', (buddy_result->>'tokens')::integer,
    'vitality', (buddy_result->>'vitality')::integer,
    'level', (buddy_result->>'level')::integer,
    'totalSaved', (buddy_result->>'total_saved')::numeric,
    'dreamFunds', buddy_result->'dream_funds',
    'completed_event_id', completed_event_id,
    'reward_event_id', reward_event_id
  );

  RETURN result_json;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.complete_challenge_atomic IS 'Round 14 ADV-R13-9: drift guard + RAISE NOTICE drift detection';
