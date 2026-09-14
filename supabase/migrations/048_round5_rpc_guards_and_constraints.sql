-- 048: Round 5 — auth guards for remaining 4 SECURITY DEFINER RPCs + ai_audit_logs SET NULL + CHECK constraints + embedding FK validation
--
-- 🔧 ARCH fix (Round 5):
-- C3 (Round 4 DB audit): 4 RPCs 仍无 auth.uid() guard → 跨用户数据修改/读取
-- C4 (Round 4 DB audit): user_embeddings.source_id 无 FK → 孤儿 embedding INSERT
-- H9 (Round 4 DB audit): ai_audit_logs ON DELETE CASCADE → 删用户删审计日志
-- H3 (Round 4 DB audit): buddy_state 缺 CHECK 约束 → vitality 可为负
-- H2 (Round 4 DB audit): dream_funds INTEGER vs NUMERIC 类型不匹配

-- ============================================================
-- 1. create_health_event_atomic — 加 auth guard (从 030 复制 + 加 guard)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_health_event_atomic(
  p_user_id UUID,
  p_event_type TEXT,
  p_vitality_change INTEGER DEFAULT 0,
  p_new_vitality INTEGER DEFAULT NULL,
  p_token_change INTEGER DEFAULT 0,
  p_trigger_source TEXT DEFAULT 'chat_mcp',
  p_trigger_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT '',
  p_metadata JSONB DEFAULT '{}'::jsonb
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
BEGIN
  -- 🔧 Round 5 C3: auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to create_health_event_atomic';
  END IF;

  SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.buddy_state (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    SELECT * INTO bs FROM public.buddy_state WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  new_vitality := LEAST(100, GREATEST(0, COALESCE(p_new_vitality, COALESCE(bs.vitality, 0) + p_vitality_change)));
  new_tokens := GREATEST(0, COALESCE(bs.tokens, 0) + p_token_change);
  new_health := CASE WHEN new_vitality <= 0 THEN 'dormant' WHEN new_vitality <= 20 THEN 'critical' WHEN new_vitality <= 45 THEN 'weak' WHEN new_vitality <= 75 THEN 'healthy' ELSE 'thriving' END;

  UPDATE public.buddy_state
  SET vitality = new_vitality, health = new_health, tokens = new_tokens, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
  VALUES (p_user_id, p_event_type, p_vitality_change, new_vitality, p_token_change, p_trigger_source, p_trigger_id, p_description, p_metadata)
  ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
  RETURNING id INTO event_id;

  RETURN jsonb_build_object('success', true, 'eventId', event_id, 'newVitality', new_vitality, 'newTokens', new_tokens);
END;
$$;

REVOKE ALL ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_health_event_atomic(UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- ============================================================
-- 2. create_challenge_atomic — 加 auth guard
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_challenge_atomic(
  p_user_id UUID,
  p_item_name TEXT,
  p_amount NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  new_id UUID;
BEGIN
  -- 🔧 Round 5 C3: auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to create_challenge_atomic';
  END IF;

  UPDATE public.active_challenges
  SET status = 'expired', updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.active_challenges (user_id, item_name, amount, status)
  VALUES (p_user_id, p_item_name, p_amount, 'active')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_challenge_atomic(UUID, TEXT, NUMERIC) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_challenge_atomic(UUID, TEXT, NUMERIC) FROM anon;

-- ============================================================
-- 3. complete_challenge_atomic — 加 auth guard
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_challenge_atomic(
  p_challenge_id UUID,
  p_user_id UUID,
  p_challenge_status TEXT DEFAULT 'passed',
  p_token_delta INTEGER DEFAULT 0,
  p_vitality_delta INTEGER DEFAULT 0,
  p_xp_delta INTEGER DEFAULT 0,
  p_challenges_delta INTEGER DEFAULT 0,
  p_add_badges TEXT[] DEFAULT '{}',
  p_total_saved_delta NUMERIC DEFAULT 0,
  p_dream_fund_id TEXT DEFAULT NULL,
  p_dream_fund_amount NUMERIC DEFAULT 0,
  p_completed_trigger_id TEXT DEFAULT NULL,
  p_completed_description TEXT DEFAULT NULL,
  p_completed_metadata JSONB DEFAULT '{}'::jsonb,
  p_reward_trigger_id TEXT DEFAULT NULL,
  p_reward_description TEXT DEFAULT NULL,
  p_reward_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
  cas_rows_affected INTEGER := 0;
  challenge_row RECORD;
  buddy_result JSONB;
  completed_event_id UUID;
  reward_event_id UUID;
  result_json JSONB;
BEGIN
  -- 🔧 Round 5 C3: auth guard
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to complete_challenge_atomic';
  END IF;

  UPDATE public.active_challenges
  SET status = p_challenge_status, updated_at = now()
  WHERE id = p_challenge_id AND user_id = p_user_id AND status = 'active';

  GET DIAGNOSTICS cas_rows_affected = ROW_COUNT;

  IF cas_rows_affected = 0 THEN
    SELECT * INTO challenge_row FROM public.active_challenges WHERE id = p_challenge_id AND user_id = p_user_id;
    RETURN jsonb_build_object('success', false, 'cas_failed', true, 'current_status', challenge_row.status, 'error', 'Challenge not found or not in active state');
  END IF;

  IF p_challenge_status = 'failed' THEN
    RETURN jsonb_build_object('success', true, 'cas_rows_affected', cas_rows_affected, 'status', 'failed', 'rewards_applied', false);
  END IF;

  SELECT * INTO buddy_result FROM public.apply_buddy_state_delta(
    p_user_id, p_token_delta, p_vitality_delta, p_xp_delta, p_challenges_delta,
    p_total_saved_delta, p_add_badges, p_dream_fund_id, p_dream_fund_amount, NULL, NULL, NULL
  );

  IF (buddy_result->>'success')::boolean = false THEN
    RAISE EXCEPTION 'apply_buddy_state_delta failed: %', buddy_result->>'error';
  END IF;

  IF p_completed_trigger_id IS NOT NULL THEN
    INSERT INTO public.health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
    VALUES (p_user_id, 'challenge_completed', 0, (buddy_result->>'vitality')::integer, 0, 'chat_mcp', p_completed_trigger_id, p_completed_description, p_completed_metadata)
    ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
    RETURNING id INTO completed_event_id;
  END IF;

  IF p_reward_trigger_id IS NOT NULL THEN
    INSERT INTO public.health_events (user_id, event_type, vitality_change, new_vitality, token_change, trigger_source, trigger_id, description, metadata)
    VALUES (p_user_id, 'challenge_reward', 0, (buddy_result->>'vitality')::integer, 0, 'chat_mcp', p_reward_trigger_id, p_reward_description, p_reward_metadata)
    ON CONFLICT (user_id, trigger_source, trigger_id) WHERE trigger_id IS NOT NULL DO NOTHING
    RETURNING id INTO reward_event_id;
  END IF;

  IF p_dream_fund_id IS NOT NULL AND p_dream_fund_amount > 0 THEN
    UPDATE public.dream_funds df
    SET current = (SELECT (elem->>'current')::numeric FROM jsonb_array_elements((buddy_result->'dream_funds')::jsonb) AS arr(elem) WHERE elem->>'id' = p_dream_fund_id LIMIT 1)
    WHERE df.user_id = p_user_id AND df.fund_id = p_dream_fund_id;
  END IF;

  result_json := jsonb_build_object(
    'success', true, 'cas_rows_affected', cas_rows_affected, 'status', p_challenge_status, 'rewards_applied', true,
    'tokens', (buddy_result->>'tokens')::integer, 'vitality', (buddy_result->>'vitality')::integer,
    'level', (buddy_result->>'level')::integer, 'totalSaved', (buddy_result->>'total_saved')::numeric,
    'dreamFunds', buddy_result->'dream_funds', 'completed_event_id', completed_event_id, 'reward_event_id', reward_event_id
  );
  RETURN result_json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) FROM anon;

-- ============================================================
-- 4. retrieve_user_context — 加 auth guard (从 LANGUAGE sql 改为 plpgsql)
-- ============================================================
CREATE OR REPLACE FUNCTION public.retrieve_user_context(
    p_user_id uuid,
    p_query_embedding vector(1024),
    p_top_k integer default 5,
    p_source_types text[] default null
)
returns table (
    id uuid,
    source_type text,
    source_id uuid,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
BEGIN
  -- 🔧 Round 5 C3: auth guard — 防止读取其他用户的 RAG embeddings (含聊天记录 PII)
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to retrieve_user_context';
  END IF;

  RETURN QUERY
    select
        e.id,
        e.source_type,
        e.source_id,
        e.content,
        e.metadata,
        1 - (e.embedding <=> p_query_embedding) as similarity
    from public.user_embeddings e
    where e.user_id = p_user_id
      and (p_source_types is null or e.source_type = any(p_source_types))
    order by e.embedding <=> p_query_embedding
    limit p_top_k;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retrieve_user_context(uuid, vector(1024), integer, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.retrieve_user_context(uuid, vector(1024), integer, text[]) TO authenticated, service_role;

-- ============================================================
-- 5. user_embeddings.source_id — BEFORE INSERT 验证 trigger (C4 fix)
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_embedding_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exists_ok BOOLEAN;
  table_name TEXT;
BEGIN
  table_name := CASE NEW.source_type
    WHEN 'impulse_event' THEN 'impulse_events'
    WHEN 'email_receipt' THEN 'email_receipts'
    WHEN 'chat_message'  THEN 'chat_messages'
    ELSE NULL
  END;

  IF table_name IS NULL THEN
    RAISE EXCEPTION 'invalid source_type: %', NEW.source_type;
  END IF;

  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE id = $1 AND user_id = $2)', table_name)
  INTO exists_ok USING NEW.source_id, NEW.user_id;

  IF NOT exists_ok THEN
    RAISE EXCEPTION 'orphan embedding: source_id % not found in %', NEW.source_id, table_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_embeddings_validate_source ON public.user_embeddings;
CREATE TRIGGER user_embeddings_validate_source
  BEFORE INSERT OR UPDATE OF source_id, source_type ON public.user_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.validate_embedding_source();

-- ============================================================
-- 6. ai_audit_logs — 改 ON DELETE CASCADE 为 SET NULL (H9 fix)
-- ============================================================
ALTER TABLE public.ai_audit_logs
  DROP CONSTRAINT IF EXISTS ai_audit_logs_user_id_fkey;

ALTER TABLE public.ai_audit_logs
  ADD CONSTRAINT ai_audit_logs_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- 7. buddy_state — 添加 CHECK 约束 (H3 fix)
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.buddy_state ADD CONSTRAINT buddy_state_vitality_range CHECK (vitality >= 0 AND vitality <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.buddy_state ADD CONSTRAINT buddy_state_tokens_nonneg CHECK (tokens >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.buddy_state ADD CONSTRAINT buddy_state_xp_nonneg CHECK (xp >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.buddy_state ADD CONSTRAINT buddy_state_level_min CHECK (level >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.buddy_state ADD CONSTRAINT buddy_state_xp_to_next_pos CHECK (xp_to_next > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.buddy_state ADD CONSTRAINT buddy_state_streak_nonneg CHECK (streak >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.buddy_state ADD CONSTRAINT buddy_state_total_saved_nonneg CHECK (total_saved >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 8. dream_funds — INTEGER 改 NUMERIC(12,2) (H2 fix)
-- ============================================================
ALTER TABLE public.dream_funds
  ALTER COLUMN target TYPE NUMERIC(12,2) USING target::numeric(12,2),
  ALTER COLUMN current TYPE NUMERIC(12,2) USING current::numeric(12,2);

-- 更新 CHECK 约束 (旧的用 INTEGER, 需要重建)
ALTER TABLE public.dream_funds DROP CONSTRAINT IF EXISTS dream_funds_current_check;
ALTER TABLE public.dream_funds DROP CONSTRAINT IF EXISTS dream_funds_target_check;

DO $$ BEGIN
  ALTER TABLE public.dream_funds ADD CONSTRAINT dream_funds_target_check CHECK (target > 0 AND target <= 1000000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.dream_funds ADD CONSTRAINT dream_funds_current_check CHECK (current >= 0 AND current <= target);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 9. distributed_locks — 启用 RLS (M8 fix from Round 4)
-- ============================================================
ALTER TABLE public.distributed_locks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY distributed_locks_deny_all ON public.distributed_locks
    FOR ALL TO authenticated, anon
    USING (false) WITH CHECK (false);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON FUNCTION public.retrieve_user_context IS 'Round 5 C3 fix: add auth.uid() guard + convert to plpgsql';
COMMENT ON FUNCTION public.validate_embedding_source IS 'Round 5 C4 fix: prevent orphan embedding INSERTs';
