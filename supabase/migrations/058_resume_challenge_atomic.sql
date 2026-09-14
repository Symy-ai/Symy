-- 058: resume_challenge_atomic RPC — atomic challenge resume (Round 19 P0)
--
-- 🔧 ARCH fix (Round 19 BUG-R19-C-3 — RPC referenced but never created):
--    src/lib/challenge-store.ts:297 调用 resume_challenge_atomic RPC,
--    但 57 个 migration 都没创建该 RPC → 每次调用都走 fallback 到非原子两步逻辑,
--    TOCTOU 竞态仍在 (Step1 expire active ↔ Step2 resume expired 之间窗口可被并发插入新 active)。
--    根因修复: 创建该 RPC, 用 SELECT ... FOR UPDATE 行锁 + 单事务原子执行两步。
--
-- 安全: SECURITY DEFINER + SET search_path = public (CVE-2024-7348 防御)
-- 权限: 仅 authenticated + service_role 可调用

CREATE OR REPLACE FUNCTION public.resume_challenge_atomic(
  p_challenge_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
  v_rows INTEGER;
  caller_uid UUID := auth.uid();
BEGIN
  -- ============================================================
  -- 0. Auth guard (Round 21 BUG-R21-C1 — 缺失 auth guard 跨用户冒充)
  -- ============================================================
  -- 🔧 ARCH fix (Round 21 BUG-R21-C1): migration 043/048 已为 apply_buddy_state_delta /
  -- create_health_event_atomic / create_challenge_atomic / complete_challenge_atomic 加了 auth guard,
  -- 058 复制 040 模板时漏掉。任何 authenticated 用户可传 victim 的 p_user_id 调此 RPC。
  -- 根因修复: 验证 caller_uid (auth.uid()) 与 p_user_id 一致 (service_role 仍可调用)。
  IF caller_uid IS NOT NULL AND caller_uid != p_user_id THEN
    RAISE EXCEPTION 'permission denied: cross-user access denied to resume_challenge_atomic'
      USING ERRCODE = '42501';
  END IF;

  -- ============================================================
  -- 1. 验证 challenge 属于用户且为 expired 状态 (行锁防并发修改)
  -- ============================================================
  SELECT * INTO v_challenge
  FROM public.active_challenges
  WHERE id = p_challenge_id
    AND user_id = p_user_id
    AND status = 'expired'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Challenge not found or not in expired state'
    );
  END IF;

  -- ============================================================
  -- 2. 原子地把用户的其他 active 挑战标 expired (单事务内)
  --    (唯一索引 active_challenges_user_active_uniq 要求每用户最多 1 个 active)
  -- ============================================================
  UPDATE public.active_challenges
  SET status = 'expired', updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'active'
    AND id <> p_challenge_id;

  -- ============================================================
  -- 3. 把目标 challenge 恢复为 active (重置 created_at 重置 24h 窗口)
  --    Round 2 H7 fix: 必须重置 created_at, 否则 25h 前 expired 的 challenge
  --    resume 后 status=active 但 created_at 仍 25h 前 → getActiveChallenge 24h 过滤器立即过滤
  -- ============================================================
  UPDATE public.active_challenges
  SET status = 'active',
      created_at = now(),
      updated_at = now(),
      completed_at = NULL
  WHERE id = p_challenge_id
    AND user_id = p_user_id
    AND status = 'expired';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    -- 极端情况: FOR UPDATE 后状态被并发改了
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Challenge state changed during resume (concurrent modification)'
    );
  END IF;

  -- ============================================================
  -- 4. 返回恢复后的 challenge (含新 created_at)
  -- ============================================================
  SELECT * INTO v_challenge
  FROM public.active_challenges
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object(
    'success', true,
    'challenge', to_jsonb(v_challenge)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

-- ============================================================
-- Permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.resume_challenge_atomic(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_challenge_atomic(UUID, UUID) TO service_role;
REVOKE EXECUTE ON FUNCTION public.resume_challenge_atomic(UUID, UUID) FROM anon;

COMMENT ON FUNCTION public.resume_challenge_atomic IS
  'Round 19 BUG-R19-C-3 fix: Atomic challenge resume — expires other active + resumes target in one transaction. Uses SELECT ... FOR UPDATE to prevent TOCTOU race.';
