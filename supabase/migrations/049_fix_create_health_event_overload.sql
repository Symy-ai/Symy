-- 049: Fix create_health_event_atomic 11-param overload (Round 5 C1) + REVOKE authenticated from all SECURITY DEFINER RPCs (C2)
--
-- 🔧 ARCH fix (Round 5):
-- C1: migration 048 用不同签名 CREATE OR REPLACE → 创建了新 overload, 旧的 11-param 版本仍无 auth guard
-- C2: 所有 SECURITY DEFINER RPCs GRANT TO authenticated → 用户可绕过服务端验证直接调 RPC 自我奖励
--     根因修复: REVOKE FROM authenticated, 只保留 service_role (前端用 apiFetch, 不直接调 RPC)

-- ============================================================
-- C1: 删除旧的 11-param create_health_event_atomic (无 auth guard), 重建带 guard 的版本
-- ============================================================

-- 先删除所有现有 overload
DROP FUNCTION IF EXISTS public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT);

-- 重建 11-param 版本 (与 health-impact.ts:575 的调用签名一致), 带 auth guard
CREATE OR REPLACE FUNCTION public.create_health_event_atomic(
  p_user_id UUID,
  p_event_type TEXT,
  p_vitality_change INTEGER DEFAULT 0,
  p_token_change INTEGER DEFAULT 0,
  p_trigger_source TEXT DEFAULT 'chat_mcp',
  p_trigger_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT '',
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_refund_amount NUMERIC DEFAULT 0,
  p_new_badges TEXT[] DEFAULT '{}',
  p_dream_fund_id TEXT DEFAULT 'df-1'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  bs RECORD;
  new_vitality INTEGER;
  new_tokens INTEGER;
  new_health TEXT;
  event_id UUID;
  current_dream_funds JSONB;
  updated_dream_funds JSONB;
  effective_fund_id TEXT;
  all_badges TEXT[];
  merged_badges TEXT[];
  merged_badges_jsonb JSONB;
BEGIN
  -- 🔧 Round 5 C1: auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to create_health_event_atomic';
  END IF;

  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.buddy_state (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  new_vitality := LEAST(100, GREATEST(0, COALESCE(bs.vitality, 0) + p_vitality_change));
  new_tokens := GREATEST(0, COALESCE(bs.tokens, 0) + p_token_change);
  new_health := CASE WHEN new_vitality <= 0 THEN 'dormant' WHEN new_vitality <= 20 THEN 'critical' WHEN new_vitality <= 45 THEN 'weak' WHEN new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

  -- Badge merge
  all_badges := ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)));
  merged_badges := ARRAY(SELECT DISTINCT unnest(all_badges || p_new_badges));
  merged_badges_jsonb := COALESCE((SELECT jsonb_agg(b) FROM unnest(merged_badges) AS b), '[]'::jsonb);

  -- Dream fund update (if refund_amount > 0)
  effective_fund_id := p_dream_fund_id;
  IF effective_fund_id = 'auto' OR effective_fund_id IS NULL THEN
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

  IF effective_fund_id IS NOT NULL AND p_refund_amount > 0 THEN
    SELECT INTO updated_dream_funds
      COALESCE(
        (SELECT jsonb_agg(
          CASE WHEN elem->>'id' = effective_fund_id
            THEN elem || jsonb_build_object('current', LEAST(COALESCE((elem->>'target')::numeric, 0), COALESCE((elem->>'current')::numeric, 0) + p_refund_amount))
            ELSE elem
          END
        ) FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)),
        COALESCE(bs.dream_funds, '[]'::jsonb)
      );
  ELSE
    updated_dream_funds := COALESCE(bs.dream_funds, '[]'::jsonb);
  END IF;

  -- Update buddy_state
  UPDATE public.buddy_state
  SET
    vitality = new_vitality,
    health = new_health,
    tokens = new_tokens,
    badges = merged_badges_jsonb,
    dream_funds = updated_dream_funds,
    total_saved = COALESCE(bs.total_saved, 0) + p_refund_amount,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Insert health_event (dedup by trigger_id)
  INSERT INTO public.health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
  VALUES (p_user_id, p_event_type, p_vitality_change, new_vitality, p_token_change, p_trigger_source, p_trigger_id, p_description, p_metadata)
  ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
  RETURNING id INTO event_id;

  RETURN jsonb_build_object(
    'success', true,
    'eventId', event_id,
    'newVitality', new_vitality,
    'newTokens', new_tokens,
    'dreamFunds', updated_dream_funds,
    'badges', merged_badges_jsonb,
    'totalSaved', COALESCE(bs.total_saved, 0) + p_refund_amount
  );
END;
$$;

-- 🔧 Round 5 C2: REVOKE FROM authenticated — 前端用 apiFetch, 不直接调 RPC
REVOKE ALL ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO service_role;

-- ============================================================
-- C2: REVOKE authenticated 从所有 SECURITY DEFINER RPCs
-- (前端用 apiFetch 到 Next.js routes, routes 用 admin client 调 RPC, 不需要 authenticated 权限)
-- ============================================================

REVOKE ALL ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) FROM authenticated;
-- 保留 service_role

REVOKE ALL ON FUNCTION public.increment_buddy_state_version(UUID) FROM authenticated;
-- 保留 service_role

REVOKE ALL ON FUNCTION public.use_healing_kit(UUID) FROM authenticated;
-- 保留 service_role

REVOKE ALL ON FUNCTION public.create_challenge_atomic(UUID, TEXT, NUMERIC) FROM authenticated;
-- 保留 service_role

REVOKE ALL ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) FROM authenticated;
-- 保留 service_role

REVOKE ALL ON FUNCTION public.retrieve_user_context(uuid, vector(1024), integer, text[]) FROM authenticated;
-- 保留 service_role

COMMENT ON FUNCTION public.create_health_event_atomic IS 'Round 5 C1+C2 fix: drop old overload, add auth guard, revoke authenticated';
