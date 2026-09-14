-- 052: Fix migration 051 ambiguous variable name (Round 12 adversarial review CRITICAL)
--
-- 🔧 ARCH fix (Round 12 review C1 — migration 051 的 SET new_vitality = new_vitality 有歧义):
--    PL/pgSQL 局部变量 new_vitality 与 health_events.new_vitality 列同名。
--    默认 variable_conflict = error → "column reference is ambiguous" → RPC 每次调用都失败。
--    根因修复: 把所有局部变量加 v_ 前缀 (v_new_vitality, v_new_tokens 等), 消除歧义。
--    同时: deduplicated 路径的 FOR UPDATE 锁不需要 (只读), 移除以避免阻塞并发写入。

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
  v_new_vitality INTEGER;
  v_new_tokens INTEGER;
  v_new_health TEXT;
  event_id UUID;
  current_dream_funds JSONB;
  updated_dream_funds JSONB;
  effective_fund_id TEXT;
  all_badges TEXT[];
  merged_badges TEXT[];
  merged_badges_jsonb JSONB;
  v_new_version INTEGER;
BEGIN
  -- 🔧 Round 5 C1: auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to create_health_event_atomic';
  END IF;

  -- 🔧 Round 12 audit C1: 先 INSERT health_event (ON CONFLICT DO NOTHING RETURNING id)
  --    若 event_id IS NULL → trigger_id 已存在 (AI 重试) → deduplicated = true, 跳过 buddy_state UPDATE。
  INSERT INTO public.health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
  VALUES (p_user_id, p_event_type, p_vitality_change, 0, p_token_change, p_trigger_source, p_trigger_id, p_description, p_metadata)
  ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
  RETURNING id INTO event_id;

  -- 若 trigger_id 重复 (event_id IS NULL), 直接返回 deduplicated — 不应用任何 delta
  IF p_trigger_id IS NOT NULL AND event_id IS NULL THEN
    -- 🔧 Round 12 review M5: dedup 路径不需要 FOR UPDATE 锁 (只读, 不修改 buddy_state)
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id;
    IF NOT FOUND THEN
      -- 用户首次访问, buddy_state 不存在 — 返回默认值
      RETURN jsonb_build_object(
        'success', true,
        'deduplicated', true,
        'eventId', NULL,
        'newVitality', 72,
        'newTokens', 156,
        'dreamFunds', '[]'::jsonb,
        'badges', '[]'::jsonb,
        'totalSaved', 0,
        'version', 1
      );
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'deduplicated', true,
      'eventId', NULL,
      'newVitality', COALESCE(bs.vitality, 72),
      'newTokens', COALESCE(bs.tokens, 156),
      'dreamFunds', COALESCE(bs.dream_funds, '[]'::jsonb),
      'badges', COALESCE(bs.badges, '[]'::jsonb),
      'totalSaved', COALESCE(bs.total_saved, 0),
      'version', COALESCE(bs.version, 1)
    );
  END IF;

  -- Lock buddy_state row for this user (非 dedup 路径需要写)
  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.buddy_state (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_new_vitality := LEAST(100, GREATEST(0, COALESCE(bs.vitality, 0) + p_vitality_change));
  v_new_tokens := GREATEST(0, COALESCE(bs.tokens, 0) + p_token_change);
  v_new_health := CASE WHEN v_new_vitality <= 0 THEN 'dormant' WHEN v_new_vitality <= 20 THEN 'critical' WHEN v_new_vitality <= 45 THEN 'weak' WHEN v_new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

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

  -- Round 11 D3: bump version (CAS integrity)
  v_new_version := COALESCE(bs.version, 1) + 1;

  -- Update buddy_state (with version bump) — 只在新事件 (非 deduplicated) 时执行
  UPDATE public.buddy_state
  SET
    vitality = v_new_vitality,
    health = v_new_health,
    tokens = v_new_tokens,
    badges = merged_badges_jsonb,
    dream_funds = updated_dream_funds,
    total_saved = COALESCE(bs.total_saved, 0) + p_refund_amount,
    version = v_new_version,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- 🔧 Round 12 review C1 fix: 用 v_new_vitality (非 new_vitality) 消除列名歧义
  UPDATE public.health_events
  SET new_vitality = v_new_vitality
  WHERE id = event_id;

  RETURN jsonb_build_object(
    'success', true,
    'deduplicated', false,
    'eventId', event_id,
    'newVitality', v_new_vitality,
    'newTokens', v_new_tokens,
    'dreamFunds', updated_dream_funds,
    'badges', merged_badges_jsonb,
    'totalSaved', COALESCE(bs.total_saved, 0) + p_refund_amount,
    'version', v_new_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO service_role;

COMMENT ON FUNCTION public.create_health_event_atomic IS 'Round 12 review C1: fix ambiguous variable name (v_ prefix) + remove unnecessary FOR UPDATE on dedup path';
