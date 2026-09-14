-- 046: use_healing_kit RPC — server-side daily limit enforcement
--
-- 🔧 ARCH fix (Round 3 数据审计 C4 — healing-kit client validation bypass):
--    旧代码 healingKitUsed 检查纯客户端 (buddy-tab.tsx 读 buddyState.lastHealingKitAt)。
--    恶意客户端可不传 lastHealingKitAt (设 null) → 绕过每日限制 → 无限刷 token/vitality/XP。
--    根因修复: 服务端 RPC 原子检查 + 应用奖励 + 设置 last_healing_kit_at。
--    时区: 用 UTC 日期 (与 Round 3 H7 的 profiles.timezone 一致, 后续可扩展为用户时区)。

CREATE OR REPLACE FUNCTION public.use_healing_kit(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  bs RECORD;
  today_str TEXT;
  last_used_date TEXT;
  new_tokens INTEGER;
  new_vitality INTEGER;
  new_xp INTEGER;
  new_xp_to_next INTEGER;
  new_level INTEGER;
  new_health TEXT;
  today_date DATE;
  last_kit_date DATE;
BEGIN
  -- 🔧 Round 3 C1: auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to use_healing_kit';
  END IF;

  -- 锁定 buddy_state 行
  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'buddy_state not found');
  END IF;

  -- 检查今日是否已用 (UTC 日期比较, 后续可用 profiles.timezone)
  today_date := CURRENT_DATE;
  last_kit_date := bs.last_healing_kit_at::DATE;

  IF last_kit_date = today_date AND bs.last_healing_kit_at IS NOT NULL THEN
    -- 今日已用 — 拒绝
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_used_today',
      'lastHealingKitAt', bs.last_healing_kit_at
    );
  END IF;

  -- 应用奖励: +3 tokens, +3 vitality, +15 XP (pleasure 场景)
  new_tokens := COALESCE(bs.tokens, 0) + 3;
  new_vitality := LEAST(100, COALESCE(bs.vitality, 0) + 3);
  new_xp := COALESCE(bs.xp, 0) + 15;
  new_xp_to_next := COALESCE(bs.xp_to_next, 100);
  new_level := COALESCE(bs.level, 1);

  -- Level up check
  IF new_xp >= new_xp_to_next THEN
    new_xp := new_xp - new_xp_to_next;
    new_level := new_level + 1;
    new_xp_to_next := FLOOR(new_xp_to_next * 1.3)::INTEGER;
  END IF;

  new_health := CASE WHEN new_vitality <= 0 THEN 'dormant' WHEN new_vitality <= 20 THEN 'critical' WHEN new_vitality <= 45 THEN 'weak' WHEN new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

  -- 原子更新 (含 last_healing_kit_at + version bump)
  UPDATE public.buddy_state
  SET
    tokens = new_tokens,
    vitality = new_vitality,
    health = new_health,
    level = new_level,
    xp = new_xp,
    xp_to_next = new_xp_to_next,
    last_healing_kit_at = now(),
    version = COALESCE(version, 0) + 1,
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
    'lastHealingKitAt', now()::TEXT,
    'version', COALESCE(version, 0) + 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_healing_kit(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.use_healing_kit(UUID) FROM anon;

COMMENT ON FUNCTION public.use_healing_kit IS
  'Round 3 C4 fix: server-side healing-kit daily limit — prevents client bypass';
