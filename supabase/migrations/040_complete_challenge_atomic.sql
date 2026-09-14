-- 040: complete_challenge_atomic RPC — atomic challenge completion across 4 tables
--
-- 🔧 ARCH fix (Round 2 C4 — challenge completion non-atomic across 4 tables):
--    旧代码 5 个独立事务:
--      1. CAS active_challenges status → passed
--      2. applyBuddyStateDelta (buddy_state + health_events via createHealthEvent)
--      3. createHealthEvent challenge_completed
--      4. createHealthEvent challenge_reward (dream fund progress)
--      5. dream_funds table sync
--    若 step 2 失败, step 1 已提交 → 挑战标记为 passed 但无奖励 → 用户永久丢失奖励。
--    若 step 5 失败, buddy_state.dream_funds 正确但 dream_funds 独立表 stale → UI 不一致。
--
--    根因修复: 单个 PostgreSQL RPC 在一个事务内完成全部操作。
--    若任何 step 失败, 整个事务回滚 (挑战状态不变, 无部分奖励)。
--
--    注意: 此 RPC 复用 apply_buddy_state_delta 的逻辑 (FOR UPDATE + delta + health_event)。
--    为避免重复, 此 RPC 调用 apply_buddy_state_delta 作为子函数 (SECURITY DEFINER 可嵌套)。

CREATE OR REPLACE FUNCTION public.complete_challenge_atomic(
  p_challenge_id UUID,
  p_user_id UUID,
  p_challenge_status TEXT DEFAULT 'passed',  -- 'passed' | 'failed'
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
    -- CAS 失败 — challenge 不存在/不属于此用户/已结束
    SELECT * INTO challenge_row FROM public.active_challenges
    WHERE id = p_challenge_id AND user_id = p_user_id;

    RETURN jsonb_build_object(
      'success', false,
      'cas_failed', true,
      'current_status', challenge_row.status,
      'error', 'Challenge not found or not in active state'
    );
  END IF;

  -- 若 status='failed', 只标记 challenge, 不加奖励 (AI 需另调 record_impulse)
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
  --    复用已有 RPC — 它内部用 FOR UPDATE + health_event INSERT
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
    NULL,  -- p_level_override
    NULL,  -- p_xp_to_next_override
    NULL   -- p_xp_override
  );

  IF (buddy_result->>'success')::boolean = false THEN
    -- buddy_state 更新失败 — 回滚 challenge CAS (整个事务回滚)
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
      0,  -- audit-only (buddy_state delta 已在 apply_buddy_state_delta 内处理)
      (buddy_result->>'vitality')::integer,
      0,
      'chat_mcp',
      p_completed_trigger_id,
      p_completed_description,
      p_completed_metadata
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
      0,
      (buddy_result->>'vitality')::integer,
      0,
      'chat_mcp',
      p_reward_trigger_id,
      p_reward_description,
      p_reward_metadata
    )
    ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO reward_event_id;
  END IF;

  -- ============================================================
  -- 5. dream_funds 独立表同步 (单事务内, 与 buddy_state 一致)
  -- ============================================================
  IF p_dream_fund_id IS NOT NULL AND p_dream_fund_amount > 0 THEN
    -- 用 buddy_result 中的 post-delta dream_funds 同步
    -- apply_buddy_state_delta 返回 'dream_funds' (snake_case) JSONB 数组
    UPDATE public.dream_funds df
    SET current = (
      SELECT (elem->>'current')::numeric
      FROM jsonb_array_elements((buddy_result->'dream_funds')::jsonb) AS arr(elem)
      WHERE elem->>'id' = p_dream_fund_id
      LIMIT 1
    )
    WHERE df.user_id = p_user_id AND df.fund_id = p_dream_fund_id;
  END IF;

  -- ============================================================
  -- 返回结果
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

GRANT EXECUTE ON FUNCTION public.complete_challenge_atomic TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.complete_challenge_atomic FROM anon;

COMMENT ON FUNCTION public.complete_challenge_atomic IS
  'Round 2 C4 fix: Atomic challenge completion — CAS + buddy_state delta + 2 health_events + dream_funds sync in one transaction';
