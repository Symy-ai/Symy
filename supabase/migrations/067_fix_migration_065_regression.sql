-- 067: Fix migration 065 regression — restore badge merge + dream_funds INSERT (Round 24 C1/C2)
--
-- 🔧 ARCH fix (Round 24 C1 — migration 065 丢失 054 的 badge 合并逻辑):
--    migration 065 重建 create_health_event_atomic 时, 漏复制 054 的 p_new_badges 合并逻辑。
--    调用方 health-impact.ts 仍传 p_new_badges, 但 RPC 静默忽略 → 徽章永久丢失。
--    影响: refund_boost 的 first_save / mindful_recovery 的 impulse_shield 永不发放。
--
-- 🔧 ARCH fix (Round 24 C2 — migration 065 丢失 063 的 dream_funds INSERT 修复):
--    migration 065 的 auto-create 路径只 INSERT (user_id), dream_funds 走列默认 '[]'。
--    migration 063 修复了此问题 (显式 INSERT dream_funds JSONB), 但 065 回退了。
--    根因修复: 恢复 063 的显式 INSERT (target=2000, emoji=🏔️ 匹配 buddy-defaults.ts)。
--
-- 🔧 ARCH fix (Round 24 H4 — migration 063 留下 orphan overload):
--    migration 063 改签名时 CREATE OR REPLACE 创建了 9-param / 10-param orphan overload。
--    根因修复: DROP orphan overload (无调用方, 纯死代码)。
--
-- 🔧 ARCH fix (Round 24 C3 — migration 064 漏 REVOKE resume_challenge_atomic FROM authenticated):
--    migration 064 注释说 REVOKE FROM authenticated, 但 DO block 只 RAISE NOTICE。
--    根因修复: 实际执行 REVOKE。

-- ============================================================
-- 1. DROP orphan overloads (migration 063 留下的死代码)
-- ============================================================
DROP FUNCTION IF EXISTS public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[]);
DROP FUNCTION IF EXISTS public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[]);

-- ============================================================
-- 2. REVOKE resume_challenge_atomic FROM authenticated (Round 24 C3)
-- ============================================================
REVOKE ALL ON FUNCTION public.resume_challenge_atomic(UUID, UUID) FROM authenticated;

-- ============================================================
-- 3. 重建 create_health_event_atomic — 恢复 054 badge 逻辑 + 063 dream_funds INSERT
-- ============================================================
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
  effective_fund_id TEXT;
  updated_dream_funds JSONB;
  v_new_version INTEGER;
  -- 🔧 Round 24 C1: 恢复 054 的 badge 合并变量
  all_badges TEXT[];
  merged_badges TEXT[];
  merged_badges_jsonb JSONB;
BEGIN
  -- Auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to create_health_event_atomic';
  END IF;

  -- 🔧 Round 12 C1: INSERT first (dedup)
  INSERT INTO public.health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
  VALUES (p_user_id, p_event_type, p_vitality_change, 0, p_token_change, p_trigger_source, p_trigger_id, p_description, p_metadata)
  ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
  RETURNING id INTO event_id;

  -- If dedup (trigger_id exists), return early
  IF p_trigger_id IS NOT NULL AND event_id IS NULL THEN
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', true, 'deduplicated', true, 'eventId', NULL, 'newVitality', 72, 'newTokens', 156, 'version', 1);
    END IF;
    RETURN jsonb_build_object('success', true, 'deduplicated', true, 'eventId', NULL, 'newVitality', COALESCE(bs.vitality, 72), 'newTokens', COALESCE(bs.tokens, 156), 'version', COALESCE(bs.version, 1));
  END IF;

  -- Lock buddy_state
  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    -- 🔧 ARCH fix (Round 24 C2 — 恢复 063 的 dream_funds INSERT 修复):
    --    065 回退到只 INSERT (user_id), dream_funds 走列默认 '[]' → UI 显示空。
    --    根因修复: 显式 INSERT dream_funds JSONB (target=2000, emoji=🏔️ 匹配 buddy-defaults.ts)。
    INSERT INTO public.buddy_state (
      user_id, vitality, tokens, health, level, xp, xp_to_next,
      streak, dream_funds, badges, total_saved, challenges_completed,
      last_drain_at, updated_at
    ) VALUES (
      p_user_id, 72, 156, 'healthy', 1, 0, 100, 0,
      '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb,
      '[]'::jsonb, 0, 0, now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  v_new_vitality := LEAST(100, GREATEST(0, COALESCE(bs.vitality, 0) + p_vitality_change));
  v_new_tokens := GREATEST(0, COALESCE(bs.tokens, 0) + p_token_change);
  v_new_health := CASE WHEN v_new_vitality <= 0 THEN 'dormant' WHEN v_new_vitality <= 20 THEN 'critical' WHEN v_new_vitality <= 45 THEN 'weak' WHEN v_new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

  -- Dream fund update
  effective_fund_id := p_dream_fund_id;
  IF effective_fund_id = 'auto' OR effective_fund_id IS NULL THEN
    SELECT elem->>'id' INTO effective_fund_id
    FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)
    WHERE (elem->>'current')::numeric < (elem->>'target')::numeric
    LIMIT 1;
    IF effective_fund_id IS NULL THEN
      SELECT elem->>'id' INTO effective_fund_id FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem) LIMIT 1;
    END IF;
  END IF;

  IF effective_fund_id IS NOT NULL AND p_refund_amount > 0 THEN
    SELECT INTO updated_dream_funds
      COALESCE((SELECT jsonb_agg(CASE WHEN elem->>'id' = effective_fund_id THEN elem || jsonb_build_object('current', LEAST(COALESCE((elem->>'target')::numeric, 0), COALESCE((elem->>'current')::numeric, 0) + p_refund_amount)) ELSE elem END) FROM jsonb_array_elements(COALESCE(bs.dream_funds, '[]'::jsonb)) AS arr(elem)), COALESCE(bs.dream_funds, '[]'::jsonb));
  ELSE
    updated_dream_funds := COALESCE(bs.dream_funds, '[]'::jsonb);
  END IF;

  -- 🔧 ARCH fix (Round 24 C1 — 恢复 054 的 badge 合并逻辑):
  --    065 丢失此逻辑, p_new_badges 被静默忽略 → 徽章永不发放。
  --    根因修复: 合并 existing badges + p_new_badges (去重), 写入 buddy_state.badges。
  all_badges := ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)));
  merged_badges := ARRAY(SELECT DISTINCT unnest(all_badges || p_new_badges));
  merged_badges_jsonb := COALESCE((SELECT jsonb_agg(b) FROM unnest(merged_badges) AS b), '[]'::jsonb);

  v_new_version := COALESCE(bs.version, 1) + 1;

  -- 🔧 Round 24 C1: UPDATE 加 badges = merged_badges_jsonb
  UPDATE public.buddy_state
  SET vitality = v_new_vitality, health = v_new_health, tokens = v_new_tokens,
      dream_funds = updated_dream_funds, total_saved = COALESCE(bs.total_saved, 0) + p_refund_amount,
      badges = merged_badges_jsonb,
      version = v_new_version, updated_at = now()
  WHERE user_id = p_user_id;

  -- Update health_event new_vitality
  UPDATE public.health_events SET new_vitality = v_new_vitality WHERE id = event_id;

  -- 🔧 Round 24 C1: RETURN 加 badges 字段
  RETURN jsonb_build_object(
    'success', true, 'deduplicated', false, 'eventId', event_id,
    'newVitality', v_new_vitality, 'newTokens', v_new_tokens,
    'dreamFunds', updated_dream_funds, 'totalSaved', COALESCE(bs.total_saved, 0) + p_refund_amount,
    'badges', merged_badges_jsonb,
    'version', v_new_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO service_role;

COMMENT ON FUNCTION public.create_health_event_atomic IS 'Round 24 C1/C2: restore 054 badge merge + 063 dream_funds INSERT + 065 11-param signature + dedup + version bump';
