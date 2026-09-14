-- ============================================================
-- 125_deposit_batch_rpc.sql
-- 🔧 ARCH fix (2026-07-22 P0 — multi-fund retry double accumulation)
--
-- 根因: apply_buddy_state_delta is NOT idempotent (adds deltas).
-- 旧 deposit route 在循环中调用多次 RPC, 如果第 N 个失败:
--   - 已成功的 0..N-1 个 fund 的 delta 已被应用
--   - 旧代码 rollback deposit_status to 'unsettled' → 用户重试 → 0..N-1 双倍累加
--
-- 修复: 创建 batch RPC apply_deposit_batch, 在单个 DB transaction 内原子地
-- 应用所有 funds — 要么全成功, 要么全失败 (ROLLBACK)。
-- 这把原子性保证从应用层 (buggy) 转移到数据库层 (natural)。
--
-- 兼容性: 如果此 RPC 不存在 (migration 未部署), route 代码 fallback 到
-- 旧的逐个调用逻辑 (但不再 rollback, 见 route.ts 注释)。
-- ============================================================

-- 1. 创建 composite type for batch input
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deposit_fund_item') THEN
    CREATE TYPE public.deposit_fund_item AS (
      fund_id TEXT,
      amount NUMERIC,
      token_delta INTEGER
    );
  END IF;
END $$;

-- 2. 创建 batch RPC
CREATE OR REPLACE FUNCTION public.apply_deposit_batch(
  p_user_id UUID,
  p_funds public.deposit_fund_item[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buddy_state RECORD;
  v_new_vitality INTEGER;
  v_new_tokens INTEGER;
  v_new_health INTEGER;
  v_new_xp INTEGER;
  v_new_xp_to_next INTEGER;
  v_new_level INTEGER;
  v_new_total_saved NUMERIC;
  v_new_challenges INTEGER;
  v_all_badges TEXT[];
  v_merged_badges jsonb;
  v_updated_dream_funds jsonb;
  v_new_version INTEGER;
  v_item public.deposit_fund_item;
  v_effective_fund_id TEXT;
  v_fund_idx INTEGER;
  v_i INTEGER;
  v_total_token_delta INTEGER := 0;
  v_total_amount NUMERIC := 0;
BEGIN
  -- Lock buddy_state row
  SELECT * INTO v_buddy_state
  FROM public.buddy_state
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'buddy_state not found');
  END IF;

  -- Calculate totals
  FOREACH v_item IN ARRAY p_funds LOOP
    v_total_token_delta := v_total_token_delta + COALESCE(v_item.token_delta, 0);
    v_total_amount := v_total_amount + COALESCE(v_item.amount, 0);
  END LOOP;

  -- Apply token delta
  v_new_tokens := GREATEST(0, COALESCE(v_buddy_state.tokens, 0) + v_total_token_delta);

  -- Apply vitality (1.3x token delta, same as apply_buddy_state_delta)
  v_new_vitality := LEAST(100, GREATEST(0, COALESCE(v_buddy_state.vitality, 0) + FLOOR(v_total_token_delta * 1.3)));

  -- Apply health (no change for deposit, same as 063/072)
  v_new_health := COALESCE(v_buddy_state.health, 100);

  -- Apply XP (1.3x token delta)
  v_new_xp := COALESCE(v_buddy_state.xp, 0) + FLOOR(v_total_token_delta * 1.3);
  v_new_xp_to_next := COALESCE(v_buddy_state.xp_to_next, 100);
  v_new_level := COALESCE(v_buddy_state.level, 1);

  -- Level up logic (same as 063/072)
  WHILE v_new_xp >= v_new_xp_to_next LOOP
    v_new_xp := v_new_xp - v_new_xp_to_next;
    v_new_level := v_new_level + 1;
    v_new_xp_to_next := GREATEST(1, FLOOR(v_new_xp_to_next * 1.2));
  END LOOP;

  -- Total saved
  v_new_total_saved := GREATEST(0, COALESCE(v_buddy_state.total_saved, 0) + v_total_amount);
  v_new_challenges := COALESCE(v_buddy_state.challenges_completed, 0);

  -- Badges (no new badges for deposit)
  v_all_badges := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_buddy_state.badges, '[]'::jsonb)));
  v_merged_badges := COALESCE((SELECT jsonb_agg(b) FROM unnest(v_all_badges) AS b), '[]'::jsonb);

  -- Dream funds: apply ALL funds in the batch
  v_updated_dream_funds := COALESCE(v_buddy_state.dream_funds, '[]'::jsonb);

  FOREACH v_item IN ARRAY p_funds LOOP
    v_effective_fund_id := v_item.fund_id;
    IF v_effective_fund_id = 'auto' OR v_effective_fund_id IS NULL THEN
      SELECT elem->>'id' INTO v_effective_fund_id
      FROM jsonb_array_elements(v_updated_dream_funds) AS arr(elem)
      WHERE (elem->>'current')::numeric < (elem->>'target')::numeric
      LIMIT 1;
      IF v_effective_fund_id IS NULL THEN
        SELECT elem->>'id' INTO v_effective_fund_id
        FROM jsonb_array_elements(v_updated_dream_funds) AS arr(elem)
        LIMIT 1;
      END IF;
    END IF;

    IF v_effective_fund_id IS NOT NULL AND v_item.amount != 0 THEN
      v_fund_idx := -1;
      FOR v_i IN 0..jsonb_array_length(v_updated_dream_funds) - 1 LOOP
        IF (v_updated_dream_funds -> v_i ->> 'id') = v_effective_fund_id THEN
          v_fund_idx := v_i;
          EXIT;
        END IF;
      END LOOP;

      IF v_fund_idx >= 0 THEN
        v_updated_dream_funds := jsonb_set(
          v_updated_dream_funds,
          ARRAY[v_fund_idx::text, 'current'],
          to_jsonb(LEAST(
            COALESCE((v_updated_dream_funds -> v_fund_idx ->> 'target')::numeric, 0),
            GREATEST(0, COALESCE((v_updated_dream_funds -> v_fund_idx ->> 'current')::numeric, 0) + v_item.amount)
          ))
        );
      END IF;
    END IF;
  END LOOP;

  -- Version bump
  v_new_version := COALESCE(v_buddy_state.version, 1) + 1;

  -- Update buddy_state (single UPDATE — atomic)
  UPDATE public.buddy_state
  SET
    vitality = v_new_vitality,
    tokens = v_new_tokens,
    health = v_new_health,
    xp = v_new_xp,
    xp_to_next = v_new_xp_to_next,
    level = v_new_level,
    total_saved = v_new_total_saved,
    challenges_completed = v_new_challenges,
    badges = v_merged_badges,
    dream_funds = v_updated_dream_funds,
    version = v_new_version,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'vitality', v_new_vitality,
    'tokens', v_new_tokens,
    'health', v_new_health,
    'xp', v_new_xp,
    'xp_to_next', v_new_xp_to_next,
    'streak', COALESCE(v_buddy_state.streak, 0),
    'dream_funds', v_updated_dream_funds,
    'badges', v_merged_badges,
    'total_saved', v_new_total_saved,
    'challenges_completed', v_new_challenges,
    'version', v_new_version
  );
END;
$$;

-- Permissions (same as apply_buddy_state_delta)
REVOKE ALL ON FUNCTION public.apply_deposit_batch(UUID, public.deposit_fund_item[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_deposit_batch(UUID, public.deposit_fund_item[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_deposit_batch(UUID, public.deposit_fund_item[]) IS 'ARCH fix 2026-07-22: Atomic multi-fund deposit. Replaces loop of apply_buddy_state_delta calls to prevent retry double-counting. All funds applied in single DB transaction — either all succeed or all fail.';
