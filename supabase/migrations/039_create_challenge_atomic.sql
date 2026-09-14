-- 039: create_challenge_atomic RPC — atomic challenge creation
--
-- 🔧 ARCH fix (Round 2 C5 — createChallenge race condition):
--    旧代码两步: 1) UPDATE active→expired 2) INSERT new active。
--    两个并发请求都可能: A 的 INSERT 完成后, B 的 UPDATE 把 A 刚创建的 challenge 标 expired,
--    然后 B INSERT 自己的 → A 的 challenge 被意外过期。
--    根因修复: 用 PostgreSQL RPC 原子执行两步 (单事务 + 行锁)。

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
  new_id UUID;
BEGIN
  -- 1. 过期现有 active challenges (单事务内, 行锁防并发)
  UPDATE public.active_challenges
  SET status = 'expired', updated_at = now()
  WHERE user_id = p_user_id AND status = 'active';

  -- 2. 插入新 active challenge
  INSERT INTO public.active_challenges (user_id, item_name, amount, status)
  VALUES (p_user_id, p_item_name, p_amount, 'active')
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_challenge_atomic TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_challenge_atomic FROM anon;

COMMENT ON FUNCTION public.create_challenge_atomic IS
  'Round 2 C5 fix: Atomic challenge creation — expires existing active + inserts new in one transaction';
