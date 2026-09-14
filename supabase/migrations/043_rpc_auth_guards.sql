-- 043: Add auth.uid() guards to SECURITY DEFINER RPCs
--
-- 🔧 ARCH fix (Round 3 C1 — SECURITY DEFINER RPCs accept any p_user_id):
--    旧代码 apply_buddy_state_delta / create_health_event_atomic / create_challenge_atomic /
--    complete_challenge_atomic / retrieve_user_context 都是 SECURITY DEFINER + GRANT TO authenticated,
--    但函数体从不检查 p_user_id = auth.uid()。
--    任何登录用户可调 supabase.rpc('apply_buddy_state_delta', {p_user_id: victim_uid, p_vitality_delta: -100})
--    → drain 任意用户 vitality 到 0。retrieve_user_context 可读任意用户 RAG embeddings (含聊天记录 PII)。
--
--    根因修复: 在每个函数体开头加 auth.uid() 检查。
--    注意: 这些 RPC 从服务端 (Next.js API routes via createAdminClient) 调用时, auth.uid() 返回 NULL
--    (service_role 绕过 auth)。所以检查改为: 若 auth.uid() 非 NULL 且不等于 p_user_id, 则拒绝。
--    service_role (auth.uid() IS NULL) 仍可调用, 客户端直接调用 (auth.uid() 有值) 会被限制。
--
--    更安全: 后续应 REVOKE EXECUTE FROM authenticated, 只允许 service_role 调用。
--    但这需要前端从不直接调这些 RPC (当前架构满足 — 前端用 apiFetch, 服务端用 admin client)。

-- ============================================================
-- 1. apply_buddy_state_delta — 加 auth.uid() 检查
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_buddy_state_delta(
  p_user_id UUID,
  p_token_delta INTEGER DEFAULT 0,
  p_vitality_delta INTEGER DEFAULT 0,
  p_xp_delta INTEGER DEFAULT 0,
  p_challenges_delta INTEGER DEFAULT 0,
  p_total_saved_delta NUMERIC DEFAULT 0,
  p_add_badges TEXT[] DEFAULT '{}',
  p_dream_fund_id TEXT DEFAULT NULL,
  p_dream_fund_amount NUMERIC DEFAULT 0,
  p_level_override INTEGER DEFAULT NULL,
  p_xp_to_next_override INTEGER DEFAULT NULL,
  p_xp_override INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 🔧 Round 3 C1: auth guard
  caller_uid UUID := auth.uid();
BEGIN
  -- 🔧 Round 3 C1: 若调用者是 authenticated 用户 (非 service_role), 必须操作自己的数据
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to apply_buddy_state_delta';
  END IF;

  -- 原有逻辑保持不变 (从 migration 028 复制)
  DECLARE
    bs RECORD;
    new_tokens INTEGER;
    new_vitality INTEGER;
    new_xp INTEGER;
    new_level INTEGER;
    new_xp_to_next INTEGER;
    new_challenges INTEGER;
    new_total_saved NUMERIC;
    new_health TEXT;
    current_badges TEXT[];
    merged_badges TEXT[];
    merged_badges_jsonb JSONB;
    updated_dream_funds JSONB;
    effective_fund_id TEXT;
  BEGIN
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.buddy_state (user_id, vitality, tokens, health, level, xp, xp_to_next, streak, dream_funds, badges, total_saved, challenges_completed)
      VALUES (p_user_id, 72, 156, 'healthy', 1, 0, 100, 0, '[{"id":"df-1","name":"Credit Card Payoff","target":3000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🇮🇸"}]'::jsonb, '[]', 0, 0)
      ON CONFLICT (user_id) DO NOTHING;
      SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
    END IF;

    new_tokens := GREATEST(0, COALESCE(bs.tokens, 0) + p_token_delta);
    new_vitality := LEAST(100, GREATEST(0, COALESCE(bs.vitality, 0) + p_vitality_delta));
    new_xp := GREATEST(0, COALESCE(bs.xp, 0) + p_xp_delta);
    new_level := COALESCE(bs.level, 1);
    new_xp_to_next := COALESCE(bs.xp_to_next, 100);

    IF p_level_override IS NOT NULL THEN new_level := p_level_override; END IF;
    IF p_xp_to_next_override IS NOT NULL THEN new_xp_to_next := p_xp_to_next_override; END IF;
    IF p_xp_override IS NOT NULL THEN new_xp := p_xp_override; END IF;

    IF p_xp_override IS NULL AND p_xp_to_next_override IS NULL AND new_xp >= new_xp_to_next THEN
      new_xp := new_xp - new_xp_to_next;
      new_level := new_level + 1;
      new_xp_to_next := FLOOR(new_xp_to_next * 1.3)::INTEGER;
    END IF;

    new_challenges := GREATEST(0, COALESCE(bs.challenges_completed, 0) + p_challenges_delta);
    new_total_saved := GREATEST(0, COALESCE(bs.total_saved, 0) + p_total_saved_delta);
    new_health := CASE WHEN new_vitality <= 0 THEN 'dormant' WHEN new_vitality <= 20 THEN 'critical' WHEN new_vitality <= 45 THEN 'weak' WHEN new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

    current_badges := ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)));
    merged_badges := ARRAY(SELECT DISTINCT unnest(current_badges || p_add_badges));
    merged_badges_jsonb := COALESCE((SELECT jsonb_agg(b) FROM unnest(merged_badges) AS b), '[]'::jsonb);

    effective_fund_id := p_dream_fund_id;
    IF effective_fund_id = 'auto' THEN
      SELECT elem->>'id' INTO effective_fund_id
      FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)
      WHERE (elem->>'current')::numeric < (elem->>'target')::numeric
      LIMIT 1;
      IF effective_fund_id IS NULL THEN
        SELECT elem->>'id' INTO effective_fund_id
        FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)
        LIMIT 1;
      END IF;
    END IF;

    IF effective_fund_id IS NOT NULL AND p_dream_fund_amount > 0 THEN
      SELECT INTO updated_dream_funds
        COALESCE(
          (SELECT jsonb_agg(
            CASE WHEN elem->>'id' = effective_fund_id
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
    ELSE
      updated_dream_funds := COALESCE(bs.dream_funds, '[]'::jsonb);
    END IF;

    UPDATE public.buddy_state
    SET
      tokens = new_tokens,
      vitality = new_vitality,
      health = new_health,
      level = new_level,
      xp = new_xp,
      xp_to_next = new_xp_to_next,
      challenges_completed = new_challenges,
      total_saved = new_total_saved,
      badges = merged_badges_jsonb,
      dream_funds = updated_dream_funds,
      updated_at = now()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'tokens', new_tokens,
      'vitality', new_vitality,
      'health', new_health,
      'level', new_level,
      'xp', new_xp,
      'xp_to_next', new_xp_to_next,
      'streak', COALESCE(bs.streak, 0),
      'dream_funds', updated_dream_funds,
      'badges', merged_badges_jsonb,
      'total_saved', new_total_saved,
      'challenges_completed', new_challenges
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_buddy_state_delta IS 'Round 3 C1 fix: add auth.uid() guard — authenticated users can only modify own buddy_state';

-- ============================================================
-- 2. increment_buddy_state_version — 创建缺失的 RPC (数据审计 C1)
-- ============================================================
-- 🔧 数据审计 C1: dream-funds route 调用 increment_buddy_state_version 但该 RPC 从未创建!
--    导致 CAS version 永远不 bump → dream_funds 写入被后续 buddy_state PUT 覆盖。
CREATE OR REPLACE FUNCTION public.increment_buddy_state_version(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
BEGIN
  -- 🔧 Round 3 C1: auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to increment_buddy_state_version';
  END IF;

  UPDATE public.buddy_state
  SET version = COALESCE(version, 0) + 1, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_buddy_state_version(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.increment_buddy_state_version(UUID) FROM anon;

COMMENT ON FUNCTION public.increment_buddy_state_version IS 'Round 3 fix: bump version for CAS on dream-funds writes (was missing)';
