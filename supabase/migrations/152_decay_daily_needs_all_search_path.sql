-- ============================================================
-- R545: decay_daily_needs_all 补 search_path (纵深防御一致性)
--
-- 🔧 R545 SECURITY DEFINER 全函数扫描: 27 个 definer 函数 26 个带
--    search_path, 唯缺 decay_daily_needs_all (092 创建)。
--
--    实际风险不适用 (非真 bug):
--    - 097 已 REVOKE anon/authenticated/public + 仅 GRANT service_role
--    - 函数体引用全限定 (public.buddy_state / public.decay_daily_needs)
--
--    但 CVE-2024-7348 防御一致性 (26/27 → 27/27) 一行成本补齐。
-- ============================================================

create or replace function public.decay_daily_needs_all(p_decay_amount integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_user record;
begin
  for v_user in select user_id from public.buddy_state loop
    perform public.decay_daily_needs(v_user.user_id, p_decay_amount);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

REVOKE EXECUTE ON FUNCTION public.decay_daily_needs_all(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.decay_daily_needs_all(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decay_daily_needs_all(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.decay_daily_needs_all(integer) TO service_role;
