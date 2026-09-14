-- Migration 050: Round 11 — 根因修复 (CAS version bump + REVOKE 错误回滚 + trigger search_path + RLS WITH CHECK)
--
-- 🔧 ARCH fix (Round 11):
-- D1 (CRITICAL — 049 REVOKE 误伤 dream-funds route):
--    049 REVOKE authenticated FROM increment_buddy_state_version + apply_buddy_state_delta,
--    但 dream-funds/route.ts 用 createAuthenticatedClient (user's auth), 不是 admin client。
--    → RPC 调用必抛 permission denied → syncToBuddyStateCache 静默吞错, 写 cache 但 version 不 bump
--    → 后续 buddy/state PUT CAS 检查通过旧 version, 用旧 dream_funds 覆盖刚写入的
--    根因修复: RE-GRANT authenticated — auth guard 已在 043 添加 (caller_uid != p_user_id 检查), 安全。
--    service_role 仍可调用 (auth.uid() 返回 NULL, guard 允许 NULL caller)。
--
-- D2 (CRITICAL — apply_buddy_state_delta 不 bump version → CAS 失效):
--    043 重建 apply_buddy_state_delta 时 UPDATE 语句不写 version 列。
--    MCP 工具改 buddy_state 后客户端 stale version CAS 仍通过 → 客户端 PUT 静默回滚 MCP 改动。
--    根因修复: 所有 UPDATE 语句加 version = COALESCE(bs.version, 1) + 1。
--
-- D3 (CRITICAL — create_health_event_atomic 不 bump version):
--    049 重建时 UPDATE 语句不写 version 列。同 D2 问题。
--    根因修复: UPDATE 语句加 version = COALESCE(bs.version, 1) + 1。
--
-- D4 (HIGH — trigger 函数缺 search_path):
--    002 handle_new_user / 005 handle_new_buddy_state / 047 update_active_challenges_updated_at
--    都是 SECURITY DEFINER 但无 SET search_path → SQL injection 风险 (CVE-2024-7348 模式)。
--    根因修复: ALTER FUNCTION ... SET search_path = public。
--
-- D5 (HIGH — UPDATE RLS policy 缺 WITH CHECK → 用户可转移所有权):
--    butterfly_sessions_update / active_challenges_update_own / email_receipts update policy
--    只有 USING (检查旧行) 没 WITH CHECK (检查新行) → 用户可改 user_id 转移到他人。
--    根因修复: DROP + CREATE 带 WITH CHECK。

-- ============================================================
-- D1: RE-GRANT authenticated on increment_buddy_state_version + apply_buddy_state_delta
-- (049 误伤 dream-funds route, 该 route 用 authenticated client)
-- ============================================================

GRANT EXECUTE ON FUNCTION public.increment_buddy_state_version(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) TO authenticated;

-- 注: create_health_event_atomic 仍只 service_role (前端不直接调, 由 health-impact.ts 用 admin client 调)
-- 注: create_challenge_atomic / complete_challenge_atomic / retrieve_user_context 仍只 service_role
--     (前端走 Next.js API routes 用 admin client, 不需要 authenticated)

COMMENT ON FUNCTION public.increment_buddy_state_version(UUID) IS 'Round 11 D1: re-grant authenticated (049 误伤 dream-funds route). auth guard 已在 043 添加。';

-- ============================================================
-- D2: apply_buddy_state_delta — 重建带 version bump
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_buddy_state_delta(
  p_user_id              UUID,
  p_token_delta          INTEGER DEFAULT 0,
  p_vitality_delta       INTEGER DEFAULT 0,
  p_xp_delta             INTEGER DEFAULT 0,
  p_challenges_delta     INTEGER DEFAULT 0,
  p_total_saved_delta    NUMERIC DEFAULT 0,
  p_add_badges           TEXT[] DEFAULT '{}',
  p_dream_fund_id        TEXT DEFAULT NULL,
  p_dream_fund_amount    NUMERIC DEFAULT 0,
  p_level_override       INTEGER DEFAULT NULL,
  p_xp_to_next_override  INTEGER DEFAULT NULL,
  p_xp_override          INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid         UUID := auth.uid();
  bs                 RECORD;
  new_vitality       INTEGER;
  new_tokens         INTEGER;
  new_xp             INTEGER;
  new_xp_to_next     INTEGER;
  new_level          INTEGER;
  new_health         TEXT;
  new_total_saved    NUMERIC;
  new_challenges     INTEGER;
  updated_dream_funds JSONB;
  effective_fund_id  TEXT;
  all_badges         TEXT[];
  badge_item         TEXT;
  badges_jsonb       JSONB;
  fund_idx           INTEGER;
  new_version        INTEGER;
BEGIN
  -- Round 3 C1: auth guard (service_role bypasses via NULL caller_uid)
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to apply_buddy_state_delta';
  END IF;

  -- 1. Lock buddy_state row for this user
  SELECT * INTO bs
  FROM public.buddy_state
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 🔧 ARCH fix (Round 11 ADV-R11-1 — 重建漏复制 ON CONFLICT 导致并发新用户 PK violation):
  --    043 版本用 INSERT ... ON CONFLICT (user_id) DO NOTHING + 重 SELECT (防并发)。
  --    050 初版误用 RETURNING * INTO bs (无 ON CONFLICT) → 并发新用户扡 PK violation。
  --    根因修复: 恢复 ON CONFLICT + 重 SELECT 模式。
  IF NOT FOUND THEN
    INSERT INTO public.buddy_state (
      user_id, vitality, tokens, health, level, xp, xp_to_next,
      streak, dream_funds, badges, total_saved, challenges_completed,
      last_drain_at, updated_at
    ) VALUES (
      p_user_id, 72, 156, 'healthy', 1, 0, 100, 0,
      '[{"id":"df-1","name":"Credit Card Payoff","target":3000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🇮🇸"}]'::jsonb,
      '[]'::jsonb, 0, 0, now(), now()
    )
    ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- 2. Apply additive deltas
  new_vitality := GREATEST(0, LEAST(100, COALESCE(bs.vitality, 72) + p_vitality_delta));
  new_tokens := GREATEST(0, COALESCE(bs.tokens, 156) + p_token_delta);

  IF p_xp_override IS NOT NULL THEN
    new_xp := p_xp_override;
  ELSE
    new_xp := GREATEST(0, COALESCE(bs.xp, 0) + p_xp_delta);
  END IF;

  new_xp_to_next := COALESCE(p_xp_to_next_override, COALESCE(bs.xp_to_next, 100));
  new_level := COALESCE(p_level_override, COALESCE(bs.level, 1));

  IF p_xp_override IS NULL AND new_xp >= new_xp_to_next THEN
    new_xp := new_xp - new_xp_to_next;
    new_xp_to_next := FLOOR(new_xp_to_next * 1.3)::INTEGER;
    new_level := new_level + 1;
  END IF;

  new_health := CASE
    WHEN new_vitality <= 0 THEN 'dormant'
    WHEN new_vitality <= 20 THEN 'critical'
    WHEN new_vitality <= 45 THEN 'weak'
    WHEN new_vitality <= 75 THEN 'healthy'
    ELSE 'thriving'
  END;

  new_total_saved := GREATEST(0, COALESCE(bs.total_saved, 0) + p_total_saved_delta);
  new_challenges := GREATEST(0, COALESCE(bs.challenges_completed, 0) + p_challenges_delta);

  -- Round 11 D2: bump version (CAS integrity)
  new_version := COALESCE(bs.version, 1) + 1;

  -- 3. Update buddy_state (with version bump)
  UPDATE public.buddy_state
  SET
    vitality            = new_vitality,
    tokens              = new_tokens,
    health              = new_health,
    xp                  = new_xp,
    xp_to_next          = new_xp_to_next,
    level               = new_level,
    total_saved         = new_total_saved,
    challenges_completed = new_challenges,
    version             = new_version,
    updated_at          = now()
  WHERE user_id = p_user_id;

  -- 4. Badge awards (deduplicated)
  IF array_length(p_add_badges, 1) > 0 THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(bs.badges, '[]'::jsonb)))
    INTO all_badges;

    FOREACH badge_item IN ARRAY p_add_badges LOOP
      IF NOT (badge_item = ANY(all_badges)) THEN
        all_badges := array_append(all_badges, badge_item);
      END IF;
    END LOOP;

    SELECT COALESCE(jsonb_agg(b), '[]'::jsonb) INTO badges_jsonb
    FROM unnest(all_badges) AS b;

    UPDATE public.buddy_state
    SET badges = badges_jsonb, version = version + 1, updated_at = now()
    WHERE user_id = p_user_id;

    new_version := new_version + 1;
  END IF;

  -- 5. Dream fund progress (increment specific fund)
  -- 🔧 ARCH fix (Round 11 ADV-R11-5 — 恢复 011/028/043 的 'auto' dream_fund_id 解析):
  --    050 初版直接用 p_dream_fund_id 作字面 ID 匹配, 'auto' 永不匹配 → 用户进度静默丢失 (BUG-186 回归)。
  --    根因修复: 恢复 effective_fund_id 解析逻辑 — 'auto' 时选第一个 current<target 的 fund。
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

  IF effective_fund_id IS NOT NULL AND p_dream_fund_amount != 0 THEN
    updated_dream_funds := COALESCE(bs.dream_funds, '[]'::jsonb);
    fund_idx := -1;

    FOR i IN 0..jsonb_array_length(updated_dream_funds) - 1 LOOP
      IF (updated_dream_funds -> i ->> 'id') = effective_fund_id THEN
        fund_idx := i;
        EXIT;
      END IF;
    END LOOP;

    IF fund_idx >= 0 THEN
      updated_dream_funds := jsonb_set(
        updated_dream_funds,
        ARRAY[fund_idx::text, 'current'],
        to_jsonb(LEAST(
          COALESCE((updated_dream_funds -> fund_idx ->> 'target')::numeric, 0),
          GREATEST(0, COALESCE((updated_dream_funds -> fund_idx ->> 'current')::numeric, 0) + p_dream_fund_amount)
        ))
      );
    END IF;

    UPDATE public.buddy_state
    SET dream_funds = updated_dream_funds, version = version + 1, updated_at = now()
    WHERE user_id = p_user_id;

    new_version := new_version + 1;
  ELSE
    -- 无 fund 变更, updated_dream_funds 用于 RETURN
    updated_dream_funds := COALESCE(bs.dream_funds, '[]'::jsonb);
  END IF;

  -- 🔧 ARCH fix (Round 11 ADV-R11-2 — 恢复 043 的 snake_case 返回 shape + 全字段):
  --    050 初版误改 camelCase + 丢 streak/dream_funds/badges 字段
  --    → MCP handler 读 result.xp_to_next/result.streak/result.dream_funds/result.badges 拿 undefined。
  --    根因修复: 恢复 snake_case + 全字段, 只加 'version' 新字段。
  RETURN jsonb_build_object(
    'success', true,
    'vitality', new_vitality,
    'tokens', new_tokens,
    'health', new_health,
    'level', new_level,
    'xp', new_xp,
    'xp_to_next', new_xp_to_next,
    'streak', COALESCE(bs.streak, 0),
    'dream_funds', updated_dream_funds,
    'badges', COALESCE(badges_jsonb, COALESCE(bs.badges, '[]'::jsonb)),
    'total_saved', new_total_saved,
    'challenges_completed', new_challenges,
    'version', new_version
  );
END;
$$;

COMMENT ON FUNCTION public.apply_buddy_state_delta IS 'Round 11 D2: 重建带 version bump (CAS integrity)';

-- ============================================================
-- D3: create_health_event_atomic — 重建带 version bump
-- (signature 与 049 一致, 仅 UPDATE 加 version)
-- ============================================================

DROP FUNCTION IF EXISTS public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT);

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
  new_version INTEGER;
BEGIN
  -- Round 5 C1: auth guard
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

  -- Round 11 D3: bump version (CAS integrity)
  new_version := COALESCE(bs.version, 1) + 1;

  -- Update buddy_state (with version bump)
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
    'totalSaved', COALESCE(bs.total_saved, 0) + p_refund_amount,
    'version', new_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT[], TEXT) TO service_role;

COMMENT ON FUNCTION public.create_health_event_atomic IS 'Round 11 D3: 重建带 version bump (CAS integrity)';

-- ============================================================
-- D4: trigger 函数加 search_path (CVE-2024-7348 模式防护)
-- ============================================================

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.handle_new_buddy_state() SET search_path = public;
ALTER FUNCTION public.update_active_challenges_updated_at() SET search_path = public;

-- ============================================================
-- D5: UPDATE RLS policy 加 WITH CHECK (防止 user_id 转移)
-- ============================================================

-- butterfly_sessions
DROP POLICY IF EXISTS butterfly_sessions_update ON public.butterfly_sessions;
CREATE POLICY butterfly_sessions_update ON public.butterfly_sessions
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- active_challenges
DROP POLICY IF EXISTS active_challenges_update_own ON public.active_challenges;
CREATE POLICY active_challenges_update_own ON public.active_challenges
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- email_receipts
DROP POLICY IF EXISTS "Users update own email receipts" ON public.email_receipts;
CREATE POLICY "Users update own email receipts" ON public.email_receipts
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 同时检查 email_connections (003 也只有 USING)
DROP POLICY IF EXISTS "Users update own email connections" ON public.email_connections;
CREATE POLICY "Users update own email connections" ON public.email_connections
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- D6 (cleanup): 移除 buddy/state route 的 last_healing_kit_at hotfix 死代码
-- 注: 此处仅在 DB 层标记, 实际代码改动在 route.ts
-- migration 018 已部署 6+ 月, hotfix 字符串匹配永不触发
-- ============================================================

COMMENT ON COLUMN public.buddy_state.last_healing_kit_at IS 'Round 11 D6: hotfix 字符串匹配已死, 列已稳定 6+ 月, route 代码可移除 hotfix 分支';

-- ============================================================
-- D7 (HIGH — distributed-lock checkRateLimit 非原子 → rate limit 形同虚设):
--    旧代码 (src/lib/distributed-lock.ts): SELECT value → JS+1 → UPDATE, 三步非原子。
--    并发请求都读 count=5, 都写 6 → rate limit 完全失效。
--    根因修复: 新增 increment_rate_limit RPC, 用 SELECT FOR UPDATE + 原子 increment。
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key TEXT,
  p_max_hits INTEGER,
  p_window_ms BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing RECORD;
  now_ts TIMESTAMPTZ := now();
  window_start_threshold TIMESTAMPTZ;
  existing_window_start TIMESTAMPTZ;
  new_count INTEGER;
  allowed_val BOOLEAN;
  expires_at_ts TIMESTAMPTZ;
BEGIN
  -- 🔧 ARCH fix (Round 11 ADV-R11-6 — 校验 p_window_ms > 0):
  --    0 或负数让 window_start_threshold 等于/晚于 now → 永远走 "Window expired" 分支
  --    → rate limit 形同虚设。
  IF p_window_ms IS NULL OR p_window_ms <= 0 THEN
    RAISE EXCEPTION 'p_window_ms must be positive (got %)', p_window_ms;
  END IF;
  IF p_max_hits IS NULL OR p_max_hits <= 0 THEN
    RAISE EXCEPTION 'p_max_hits must be positive (got %)', p_max_hits;
  END IF;

  -- Lock the row for this key (atomic — concurrent callers block here)
  SELECT * INTO existing
  FROM public.distributed_locks
  WHERE key = p_key
  FOR UPDATE;

  -- Convert p_window_ms (BIGINT milliseconds) to interval
  window_start_threshold := now_ts - (p_window_ms || ' milliseconds')::interval;

  IF NOT FOUND THEN
    -- No row — INSERT (race-safe via ON CONFLICT, but FOR UPDATE already prevents race)
    new_count := 1;
    allowed_val := true;
    expires_at_ts := now_ts + (p_window_ms || ' milliseconds')::interval + interval '60 seconds';

    -- 🔧 ARCH fix (Round 11 ADV-R11-8 — INSERT ON CONFLICT 应递增而非重置):
    --    旧代码: ON CONFLICT DO UPDATE SET count=1 → 两个并发首次调用都返回 count=1
    --    根因修复: ON CONFLICT DO UPDATE SET count = distributed_locks.count + 1,
    --    然后重 SELECT 拿到正确的 count (虽然 FOR UPDATE 已防并发, 这是防御性设计)。
    INSERT INTO public.distributed_locks (key, value, expires_at)
    VALUES (p_key, jsonb_build_object('count', 1, 'windowStart', now_ts), expires_at_ts)
    ON CONFLICT (key) DO UPDATE
    SET value = jsonb_build_object(
                  'count', (distributed_locks.value->>'count')::INTEGER + 1,
                  'windowStart', distributed_locks.value->>'windowStart'
                ),
        expires_at = EXCLUDED.expires_at
    RETURNING (value->>'count')::INTEGER INTO new_count;

    -- 若 ON CONFLICT 触发 (new_count > 1), 重新计算 allowed
    IF new_count > 1 THEN
      allowed_val := new_count <= p_max_hits;
    END IF;
  ELSE
    existing_window_start := (existing.value->>'windowStart')::timestamptz;

    IF existing_window_start < window_start_threshold THEN
      -- Window expired — start fresh
      new_count := 1;
      allowed_val := true;
      expires_at_ts := now_ts + (p_window_ms || ' milliseconds')::interval + interval '60 seconds';

      UPDATE public.distributed_locks
      SET value = jsonb_build_object('count', 1, 'windowStart', now_ts),
          expires_at = expires_at_ts
      WHERE key = p_key;
    ELSE
      -- Within window — atomic increment
      new_count := ((existing.value->>'count')::INTEGER) + 1;
      allowed_val := new_count <= p_max_hits;
      expires_at_ts := existing_window_start + (p_window_ms || ' milliseconds')::interval + interval '60 seconds';

      UPDATE public.distributed_locks
      SET value = jsonb_build_object('count', new_count, 'windowStart', existing_window_start),
          expires_at = expires_at_ts
      WHERE key = p_key;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', allowed_val,
    'remaining', GREATEST(0, p_max_hits - new_count),
    'count', new_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_rate_limit(TEXT, INTEGER, BIGINT) TO service_role;
REVOKE ALL ON FUNCTION public.increment_rate_limit(TEXT, INTEGER, BIGINT) FROM anon, authenticated;

COMMENT ON FUNCTION public.increment_rate_limit IS 'Round 11 D7: atomic rate limit increment (replace non-atomic read-modify-write in distributed-lock.ts)';
