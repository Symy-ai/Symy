-- 051: Fix create_health_event_atomic double-apply on retry (Round 12 audit C1)
--
-- 🔧 ARCH fix (Round 12 API audit C1 — RPC 重建时 UPDATE 在 INSERT 之前, dedup 失效):
--    050 版的 create_health_event_atomic 先 UPDATE buddy_state (line 351) 再 INSERT health_events
--    (line 364, ON CONFLICT DO NOTHING)。若 trigger_id 已存在 (AI 重试), INSERT 被跳过, 但
--    UPDATE 已应用 → 双倍 vitality 伤害 / 双倍 token 奖励。
--    根因修复: 先 INSERT (ON CONFLICT DO NOTHING RETURNING id), 若 event_id IS NULL (重复)
--    则跳过 UPDATE, 返回 deduplicated:true。这样 dedup 真正生效。
--
--    下游影响:
--    - record_impulse.ts:135 读 healthResult.deduplicated → 不重复插 impulse_events
--    - add_tokens.ts / add_vitality.ts / add_dream_fund_progress.ts 同理
--    - complete_challenge.ts:140 读 deduplicated → 不重复应用奖励

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
  is_deduplicated BOOLEAN := false;
  new_version INTEGER;
BEGIN
  -- 🔧 Round 5 C1: auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to create_health_event_atomic';
  END IF;

  -- 🔧 Round 12 audit C1: 先 INSERT health_event (ON CONFLICT DO NOTHING RETURNING id)
  --    若 event_id IS NULL → trigger_id 已存在 (AI 重试) → deduplicated = true, 跳过 buddy_state UPDATE。
  --    旧代码先 UPDATE 再 INSERT → UPDATE 已应用, INSERT 被去重 → 双倍伤害/奖励。
  INSERT INTO public.health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
  VALUES (p_user_id, p_event_type, p_vitality_change, 0, p_token_change, p_trigger_source, p_trigger_id, p_description, p_metadata)
  ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
  RETURNING id INTO event_id;

  -- 若 trigger_id 重复 (event_id IS NULL), 直接返回 deduplicated — 不应用任何 delta
  IF p_trigger_id IS NOT NULL AND event_id IS NULL THEN
    is_deduplicated := true;
    -- 仍需返回当前 buddy_state 供调用方使用 (但不变更)
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.buddy_state (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
      SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
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

  -- Lock buddy_state row for this user
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

  -- Round 11 D3: bump version (CAS integrity)
  new_version := COALESCE(bs.version, 1) + 1;

  -- Update buddy_state (with version bump) — 只在新事件 (非 deduplicated) 时执行
  UPDATE public.buddy_state
  SET
    vitality = new_vitality,
    health = new_health,
    tokens = new_tokens,
    badges = merged_badges_jsonb,
    dream_funds = updated_dream_funds,
    total_saved = COALESCE(bs.total_saved, 0) + p_refund_amount,
    version = new_version,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- 更新已插入 health_event 的 new_vitality 字段 (INSERT 时填了 0, 现在用实际值)
  UPDATE public.health_events
  SET new_vitality = new_vitality
  WHERE id = event_id;

  RETURN jsonb_build_object(
    'success', true,
    'deduplicated', false,
    'eventId', event_id,
    'newVitality', new_vitality,
    'newTokens', new_tokens,
    'dreamFunds', updated_dream_funds,
    'badges', merged_badges_jsonb,
    'totalSaved', COALESCE(bs.total_saved, 0) + p_refund_amount,
    'version', new_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO service_role;

COMMENT ON FUNCTION public.create_health_event_atomic IS 'Round 12 audit C1: INSERT-first dedup — prevents double-apply on AI retry';
