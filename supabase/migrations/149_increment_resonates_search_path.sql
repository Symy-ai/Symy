-- ============================================================
-- 149: increment_resonates 加 SET search_path (CVE-2024-7348 防御)
-- ============================================================
-- v13-C RPC SECURITY DEFINER 审计 (2026-10-11 R477):
-- 136 的 increment_resonates 是 SECURITY DEFINER 但未 SET search_path。
-- 漏洞面: 恶意 schema 内同名对象可劫持函数内非限定引用 (search_path 劫持)。
-- 其余 SECURITY DEFINER RPC 终态均已带 search_path (110/114/072 等),
-- 本函数为唯一漏网。
--
-- 函数体与 136 逐行相同 (仅加 SET search_path = '') — 重建保真,
-- 未改任何业务逻辑。
--
-- 幂等: OR REPLACE 重复执行无害。
-- 回滚: 无独立回滚 (函数逻辑不变, 仅加安全设置)。

CREATE OR REPLACE FUNCTION public.increment_resonates(target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  voter uuid := auth.uid();
  inserted boolean;
BEGIN
  IF voter IS NULL THEN RETURN false; END IF;
  INSERT INTO public.daily_reflection_votes (reflection_id, user_id)
    VALUES (target, voter)
    ON CONFLICT (reflection_id, user_id) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  IF inserted THEN
    UPDATE public.daily_reflections SET resonates = resonates + 1 WHERE id = target;
    RETURN true;
  END IF;
  RETURN false;
END; $$;

GRANT EXECUTE ON FUNCTION public.increment_resonates(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_resonates(uuid) FROM anon;
