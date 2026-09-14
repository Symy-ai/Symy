-- 077: Healing Kit 凌晨4点重置 (PM-3)
--
-- 🔧 PM-3 fix: Healing Kit 每日限制改为凌晨4点重置 (而非午夜)
--   旧代码: 日期比较 (last_kit_date = today_date) — 午夜重置
--   问题: 用户晚上 11:50 用 healing kit, 12:01 就能再用 — 间隔只有 11 分钟
--   修复: 凌晨4点为 "healing day" 分界线
--   逻辑: 如果当前时间在凌晨0-4点, "今天"从昨天凌晨4点开始
--         如果上次使用时间 >= 当前 healing day 的开始时间, 则已使用

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
  now_local TIMESTAMPTZ;
  healing_day_start TIMESTAMPTZ;
  last_kit_local TIMESTAMPTZ;
  new_vitality INTEGER;
  new_tokens INTEGER;
  new_health TEXT;
  v_new_version INTEGER;
BEGIN
  -- Auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to use_healing_kit';
  END IF;

  -- 🔧 PM-3 fix: 计算当前 "healing day" 的开始时间 (凌晨4点, 用户时区)
  BEGIN
    now_local := now() AT TIME ZONE COALESCE(p_timezone, 'UTC');
  EXCEPTION WHEN OTHERS THEN
    now_local := now() AT TIME ZONE 'UTC';
  END;

  -- healing_day_start = 今天凌晨4点 (用户时区)
  healing_day_start := date_trunc('day', now_local) + INTERVAL '4 hours';
  -- 如果当前时间在凌晨0-4点, healing day 从昨天凌晨4点开始
  IF extract(hour FROM now_local) < 4 THEN
    healing_day_start := healing_day_start - INTERVAL '1 day';
  END IF;

  -- Lock buddy_state
  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Buddy state not found');
  END IF;

  -- 🔧 PM-3 fix: Check daily limit (凌晨4点重置)
  IF bs.last_healing_kit_at IS NOT NULL THEN
    -- 把 last_healing_kit_at 转为用户时区的时间戳
    BEGIN
      last_kit_local := bs.last_healing_kit_at AT TIME ZONE COALESCE(p_timezone, 'UTC');
    EXCEPTION WHEN OTHERS THEN
      last_kit_local := bs.last_healing_kit_at AT TIME ZONE 'UTC';
    END;

    -- 如果上次使用时间 >= 当前 healing day 的开始时间, 则已使用
    IF last_kit_local >= healing_day_start THEN
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

REVOKE ALL ON FUNCTION public.use_healing_kit(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.use_healing_kit(UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.use_healing_kit(UUID, TEXT) IS 'PM-3 fix: 4am reset instead of midnight';
