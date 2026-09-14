-- 060: Fix buddy_state schema defaults to match buddy-defaults.ts (Round 19 P1)
--
-- 🔧 ARCH fix (Round 17 audit HIGH #6 — buddy_state schema defaults mismatch):
--    migration 005 的 column defaults 与 src/lib/buddy-defaults.ts 不一致:
--      level:               005=3   vs buddy-defaults.ts=1
--      xp:                  005=45  vs buddy-defaults.ts=0
--      streak:              005=7   vs buddy-defaults.ts=0
--      total_saved:         005=847 vs buddy-defaults.ts=0
--      challenges_completed:005=12  vs buddy-defaults.ts=0
--    后果: 新用户 (通过 handle_new_buddy_state trigger 创建) 得到 fake 成就预填:
--      Level 3 / 45 XP / 7-day streak / $847 saved / 12 challenges completed。
--    信任崩塌: 用户看到"假成就" → 怀疑数据真实性 → 卸载。
--    根因修复: ALTER COLUMN ... SET DEFAULT 与 buddy-defaults.ts 一致。
--
-- 注: 只修正 column default, 不回填已存在的行 (现有用户的 stats 是真实的, 即使来源是 fake default,
--      他们可能已经 earn 了 vitality/tokens, 不应回退)。仅 forward-fix 新用户。

-- ============================================================
-- Fix column defaults to match buddy-defaults.ts
-- ============================================================
ALTER TABLE public.buddy_state ALTER COLUMN level SET DEFAULT 1;
ALTER TABLE public.buddy_state ALTER COLUMN xp SET DEFAULT 0;
ALTER TABLE public.buddy_state ALTER COLUMN streak SET DEFAULT 0;
ALTER TABLE public.buddy_state ALTER COLUMN total_saved SET DEFAULT 0;
ALTER TABLE public.buddy_state ALTER COLUMN challenges_completed SET DEFAULT 0;
-- xp_to_next=100 已与 buddy-defaults.ts 一致, 无需改

-- ============================================================
-- 更新 handle_new_buddy_state trigger — 053 也有此函数, 用更明确的 INSERT
-- 确保 trigger 调用时显式使用正确 default (而非依赖 column default)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_buddy_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.buddy_state (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_buddy_state IS
  'Round 19 fix: Trigger to auto-create buddy_state on new user signup. Uses column defaults (now match buddy-defaults.ts: level=1, xp=0, streak=0, total_saved=0, challenges_completed=0).';
