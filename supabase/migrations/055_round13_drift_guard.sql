-- Migration 055: Round 13 — complete_challenge_atomic drift guard
--
-- 🔧 ARCH fix (Round 13 BUG-15):
--    旧代码 (migration 040 step 5) 直接用 JSONB current 写 dream_funds 表, 无 WHERE guard。
--    drift 场景: dream_funds 表 target 已被 PATCH 调小, 但 buddy_state.dream_funds JSONB target 未同步
--    → apply_buddy_state_delta 用 JSONB target clamp 得到 new_current
--    → 直接写表会违反 CHECK (current <= target)
--    → 整个 RPC 事务回滚 → 挑战状态未更新 + 奖励丢失 + health_event 没创建
--
-- 根因修复 (短期): 加 WHERE v_new_current <= df.target guard。
--    drift 时跳过 UPDATE (保留表原值), RPC 仍成功提交。
--    代价: 表与 JSONB 暂时不一致 (后续 dream-funds PATCH 会重建), 但 RPC 不再回滚。
--
-- ⚠️ 重要: 使用与 migration 040 完全相同的参数签名, 确保 CREATE OR REPLACE 替换而非创建 overload。
--    (Round 5 migration 048→049 踩过 overload 坑, Round 13 不重蹈覆辙)
--
-- 长期修复 (R14+): 删除 buddy_state.dream_funds JSONB 列, dream_funds 表为唯一 SoT。

-- 完整重建 (签名与 040 完全一致, 仅 step 5 加 drift guard)
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
  v_new_current NUMERIC;  -- 🔧 R13 BUG-15: drift guard
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

  -- 若 status='failed', 只标记 challenge, 不加奖励
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
  -- 🔧 R13 BUG-15 fix: WHERE guard 防 JSONB↔表 drift 时 CHECK violation 回滚整个 RPC
  -- ============================================================
  IF p_dream_fund_id IS NOT NULL AND p_dream_fund_amount > 0 THEN
    -- 从 buddy_result 读取 post-delta current
    SELECT (elem->>'current')::numeric INTO v_new_current
    FROM jsonb_array_elements((buddy_result->'dream_funds')::jsonb) AS arr(elem)
    WHERE elem->>'id' = p_dream_fund_id
    LIMIT 1;

    -- 仅当 new_current <= 表 target 时才 UPDATE; 否则跳过 (drift, 保留表原值)
    UPDATE public.dream_funds df
    SET current = v_new_current
    WHERE df.user_id = p_user_id
      AND df.fund_id = p_dream_fund_id
      AND v_new_current IS NOT NULL
      AND v_new_current <= df.target;
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

-- 🔧 ADV-R13-11: 确保 grant hygiene (与 040/049 一致)
REVOKE ALL ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.complete_challenge_atomic IS 'Round 13 BUG-15: drift guard (WHERE v_new_current <= df.target) 防 CHECK violation 回滚';
