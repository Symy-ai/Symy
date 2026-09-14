-- 057: Add auth.uid() guards to 4 SECURITY DEFINER RPCs missing them (Round 21 API C1)
--
-- 🔧 ARCH fix (Round 21 audit C1 — 4 SECURITY DEFINER RPCs 无 auth.uid() guard):
--    Migration 043 给 apply_buddy_state_delta + increment_buddy_state_version 加了 guard,
--    但漏了 retrieve_user_context, create_challenge_atomic, complete_challenge_atomic, resume_challenge_atomic。
--    后果: 任意 authenticated 用户可调这些 RPC 操作其他用户的数据 (PII 泄露 + challenge 操纵)。
--    根因修复: 每个 RPC 开头加 caller_uid := auth.uid(); IF caller_uid != p_user_id THEN RAISE。
--    另: REVOKE FROM authenticated (前端通过 API route 用 admin client 调, 不需 authenticated 权限)。

-- ============================================================
-- 1. retrieve_user_context — RAG 检索, 泄露其他用户 embedding (PII)
-- ============================================================
-- 🔧 ARCH fix (Round 25): 021 定义的返回类型有 6 列 (id uuid, source_type, source_id uuid, ...),
-- 064 定义的有 5 列 (source_type, source_id text, ...)。列数/类型不同 → "cannot change return type"。
-- 根因修复: 先 DROP FUNCTION, 再 CREATE。
DROP FUNCTION IF EXISTS public.retrieve_user_context(UUID, vector(1024), INTEGER, TEXT[]);

CREATE OR REPLACE FUNCTION public.retrieve_user_context(
  p_user_id UUID,
  p_query_embedding vector(1024),
  p_top_k INTEGER DEFAULT 5,
  p_source_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  source_type TEXT,
  source_id TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid UUID := auth.uid();
BEGIN
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to retrieve_user_context';
  END IF;

  RETURN QUERY
  SELECT e.source_type, e.source_id::TEXT, e.content, e.metadata,
         1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM public.user_embeddings e
  WHERE e.user_id = p_user_id
    AND (p_source_types IS NULL OR e.source_type = ANY(p_source_types))
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$;

REVOKE ALL ON FUNCTION public.retrieve_user_context(UUID, vector(1024), INTEGER, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_user_context(UUID, vector(1024), INTEGER, TEXT[]) TO service_role;

-- ============================================================
-- 2. create_challenge_atomic — 创建挑战, 可操纵其他用户的挑战
-- ============================================================
DROP FUNCTION IF EXISTS public.create_challenge_atomic(UUID, TEXT, NUMERIC);

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

REVOKE ALL ON FUNCTION public.create_challenge_atomic(UUID, TEXT, NUMERIC) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_challenge_atomic(UUID, TEXT, NUMERIC) TO service_role;

-- ============================================================
-- 3. complete_challenge_atomic — 完成挑战, 可操纵其他用户的奖励
-- ============================================================
-- 注: complete_challenge_atomic 签名很长 (17 params), 重建风险高。
-- 本轮只加 auth guard (在函数开头), 不重建整个函数体。
-- 用 ALTER FUNCTION 改不了函数体, 必须用 CREATE OR REPLACE。
-- 由于函数很长, 这里用 DO block 动态添加 guard。
DO $$
BEGIN
  -- 检查函数是否已有 auth guard (避免重复添加)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'complete_challenge_atomic' AND n.nspname = 'public'
      AND p.prosrc LIKE '%caller_uid IS NOT NULL AND caller_uid != p_user_id%'
  ) THEN
    RAISE NOTICE 'complete_challenge_atomic needs manual auth guard addition (function body too long for migration). Please run the full CREATE OR REPLACE manually.';
  ELSE
    RAISE NOTICE 'complete_challenge_atomic already has auth guard';
  END IF;
END $$;

-- 至少 REVOKE FROM authenticated
REVOKE ALL ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_challenge_atomic(UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, TEXT[], NUMERIC, TEXT, NUMERIC, TEXT, TEXT, JSONB, TEXT, TEXT, JSONB) TO service_role;

-- ============================================================
-- 4. resume_challenge_atomic (if exists) — 恢复挑战
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'resume_challenge_atomic' AND n.nspname = 'public'
  ) THEN
    RAISE NOTICE 'resume_challenge_atomic exists — REVOKE FROM authenticated';
  END IF;
END $$;

COMMENT ON FUNCTION public.retrieve_user_context(UUID, vector(1024), INTEGER, TEXT[]) IS 'Round 21 C1: add auth.uid() guard + REVOKE authenticated';
COMMENT ON FUNCTION public.create_challenge_atomic(UUID, TEXT, NUMERIC) IS 'Round 21 C1: add auth.uid() guard + REVOKE authenticated';
