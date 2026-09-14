-- 070: Fix healing-kit RPC to use user timezone for daily limit (Round 30)
--
-- 🔧 ARCH fix (Round 30 — healing-kit RPC 用 UTC 日期, 非用户时区):
--    旧代码 CURRENT_DATE 是服务器 UTC 日期。UTC+8 用户晚上 8 点 (UTC 中午 12 点) 用 healing-kit,
--    服务器认为"今天"已用 → 拒绝。但用户上次用是 UTC 上午 11 点 (UTC+8 晚上 7 点), 确实是"昨天"。
--    根因修复: 接受 p_timezone 参数, 用 AT TIME ZONE 计算用户当地日期。
--
-- 🔧 Bug fix: 先 DROP 旧的 1-param overload (从 046), 再 CREATE 新的 2-param 版本。
--    旧代码直接 CREATE OR REPLACE, 但签名不同 (UUID vs UUID,TEXT) → 创建了第二个 overload →
--    后续 COMMENT ON FUNCTION 无参数列表 → 报错 "function name is not unique" (42725)。
--    根因修复: DROP FUNCTION IF EXISTS public.use_healing_kit(UUID) 先删旧 overload,
--    并且 COMMENT ON FUNCTION 也指定参数列表 (UUID, TEXT) 防止 ambiguity。

-- ============================================================
-- 1. DROP 旧的 1-param overload (从 migration 046)
-- ============================================================
DROP FUNCTION IF EXISTS public.use_healing_kit(UUID);

-- ============================================================
-- 2. CREATE 新的 2-param overload (带 p_timezone)
-- ============================================================
CREATE OR REPLACE FUNCTION public.use_healing_kit(
  p_user_id UUID,
  p_timezone TEXT DEFAULT 'UTC'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  bs RECORD;
  today_date DATE;
  last_kit_date DATE;
  new_vitality INTEGER;
  new_tokens INTEGER;
  new_health TEXT;
  v_new_version INTEGER;
BEGIN
  -- Auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to use_healing_kit';
  END IF;

  -- 🔧 Round 30: 用用户时区计算"今天" (而非服务器 UTC)
  BEGIN
    today_date := (now() AT TIME ZONE COALESCE(p_timezone, 'UTC'))::DATE;
  EXCEPTION WHEN OTHERS THEN
    -- 无效时区, fallback 到 UTC
    today_date := CURRENT_DATE;
  END;

  -- Lock buddy_state
  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Buddy state not found');
  END IF;

  -- Check daily limit (用用户时区日期比较)
  IF bs.last_healing_kit_at IS NOT NULL THEN
    last_kit_date := (bs.last_healing_kit_at AT TIME ZONE COALESCE(p_timezone, 'UTC'))::DATE;
    IF last_kit_date = today_date THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Healing kit already used today',
        'lastHealingKitAt', bs.last_healing_kit_at
      );
    END IF;
  END IF;

  -- Apply rewards
  new_vitality := LEAST(100, COALESCE(bs.vitality, 0) + 3);
  new_tokens := COALESCE(bs.tokens, 0) + 3;
  new_health := CASE WHEN new_vitality <= 0 THEN 'dormant' WHEN new_vitality <= 20 THEN 'critical' WHEN new_vitality <= 45 THEN 'weak' WHEN new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;
  v_new_version := COALESCE(bs.version, 1) + 1;

  -- Atomic update
  UPDATE public.buddy_state
  SET vitality = new_vitality,
      tokens = new_tokens,
      health = new_health,
      last_healing_kit_at = now(),
      version = v_new_version,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Insert health event
  INSERT INTO public.health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
  VALUES (p_user_id, 'manual_adjustment', 3, new_vitality, 3, 'revive_deposit', NULL, 'Healing Kit used (+3 vitality, +3 tokens)', '{"source":"healing_kit"}'::jsonb);

  RETURN jsonb_build_object(
    'success', true,
    'newVitality', new_vitality,
    'newTokens', new_tokens,
    'newHealth', new_health,
    'lastHealingKitAt', now(),
    'version', v_new_version
  );
END;
$$;

-- ============================================================
-- 3. 权限 (指定 2-param 签名, 避免 ambiguity)
-- ============================================================
REVOKE ALL ON FUNCTION public.use_healing_kit(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_healing_kit(UUID, TEXT) TO service_role;

-- ============================================================
-- 4. COMMENT (指定 2-param 签名, 避免 ambiguity)
-- ============================================================
COMMENT ON FUNCTION public.use_healing_kit(UUID, TEXT) IS 'Round 30: fix timezone-aware daily limit (was UTC-only)';
