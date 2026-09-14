-- 047: Round 4 audit fixes — active_challenges.updated_at + handle_new_buddy_state ON CONFLICT + use_healing_kit auto-create
--
-- 🔧 ARCH fix (Round 4 DB audit):
-- C1: active_challenges 缺 updated_at 列 → migration 039/040 的 RPC 引用 updated_at 会报错
-- C5: handle_new_buddy_state 丢失 ON CONFLICT → 新用户注册可能失败
-- M9: use_healing_kit 不自动创建 buddy_state → 旧用户调用失败

-- ============================================================
-- C1: 添加 active_challenges.updated_at 列 + trigger
-- ============================================================
ALTER TABLE public.active_challenges
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_active_challenges_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_active_challenges_updated_at ON public.active_challenges;
CREATE TRIGGER trg_active_challenges_updated_at
    BEFORE UPDATE ON public.active_challenges
    FOR EACH ROW EXECUTE FUNCTION public.update_active_challenges_updated_at();

-- ============================================================
-- C5: handle_new_buddy_state 加回 ON CONFLICT (防 unique_violation 导致注册失败)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_buddy_state()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.buddy_state (user_id, dream_funds)
    VALUES (
        new.id,
        '[{"id":"df-1","name":"Credit Card Payoff","target":3000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🇮🇸"}]'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- M9: use_healing_kit 自动创建 buddy_state (若不存在)
-- ============================================================
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
  new_tokens INTEGER;
  new_vitality INTEGER;
  new_xp INTEGER;
  new_xp_to_next INTEGER;
  new_level INTEGER;
  new_health TEXT;
  today_date DATE;
  last_kit_date DATE;
BEGIN
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to use_healing_kit';
  END IF;

  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;

  -- 🔧 M9 fix: 若 buddy_state 不存在, 自动创建 (与 apply_buddy_state_delta 一致)
  IF NOT FOUND THEN
    INSERT INTO public.buddy_state (user_id, dream_funds)
    VALUES (
      p_user_id,
      '[{"id":"df-1","name":"Credit Card Payoff","target":3000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🇮🇸"}]'::jsonb
    )
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'buddy_state not found');
  END IF;

  today_date := CURRENT_DATE;
  last_kit_date := bs.last_healing_kit_at::DATE;

  IF last_kit_date = today_date AND bs.last_healing_kit_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'already_used_today',
      'lastHealingKitAt', bs.last_healing_kit_at
    );
  END IF;

  new_tokens := COALESCE(bs.tokens, 0) + 3;
  new_vitality := LEAST(100, COALESCE(bs.vitality, 0) + 3);
  new_xp := COALESCE(bs.xp, 0) + 15;
  new_xp_to_next := COALESCE(bs.xp_to_next, 100);
  new_level := COALESCE(bs.level, 1);

  IF new_xp >= new_xp_to_next THEN
    new_xp := new_xp - new_xp_to_next;
    new_level := new_level + 1;
    new_xp_to_next := FLOOR(new_xp_to_next * 1.3)::INTEGER;
  END IF;

  new_health := CASE WHEN new_vitality <= 0 THEN 'dormant' WHEN new_vitality <= 20 THEN 'critical' WHEN new_vitality <= 45 THEN 'weak' WHEN new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

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
    'version', COALESCE(bs.version, 0) + 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_healing_kit(UUID) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.use_healing_kit(UUID) FROM anon;

-- ============================================================
-- H7: 删除冗余索引 idx_buddy_state_user (user_id 已是主键, 自动有索引)
-- ============================================================
DROP INDEX IF EXISTS public.idx_buddy_state_user;

COMMENT ON FUNCTION public.update_active_challenges_updated_at IS 'Round 4 C1 fix: auto-update updated_at on active_challenges';
COMMENT ON FUNCTION public.handle_new_buddy_state IS 'Round 4 C5 fix: restore ON CONFLICT to prevent signup failure';
