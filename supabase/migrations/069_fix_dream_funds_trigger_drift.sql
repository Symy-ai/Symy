-- 069: Fix dream_funds schema drift — trigger target=3000 → 2000 (Round 29)
--
-- 🔧 ARCH fix (Round 28 audit — dream_funds schema drift):
--    migration 053 trigger 用 target=3000, emoji=🇮🇸
--    migration 063/067 RPC 用 target=2000, emoji=🏔️
--    buddy-defaults.ts 用 target=2000, emoji=🏔️
--    根因修复: 统一 trigger 为 target=2000, emoji=🏔️ (与 buddy-defaults.ts + RPC 一致)。

CREATE OR REPLACE FUNCTION public.handle_new_buddy_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.buddy_state (
    user_id, vitality, tokens, health, level, xp, xp_to_next,
    streak, dream_funds, badges, total_saved, challenges_completed,
    last_drain_at, updated_at
  ) VALUES (
    NEW.id, 72, 156, 'healthy', 1, 0, 100, 0,
    '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb,
    '[]'::jsonb, 0, 0, now(), now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Also insert into dream_funds independent table (migration 023)
  INSERT INTO public.dream_funds (user_id, fund_id, name, target, current, emoji, sort_order)
  VALUES
    (NEW.id, 'df-1', 'Credit Card Payoff', 2000, 0, '💳', 0),
    (NEW.id, 'df-2', 'Iceland Trip', 5000, 0, '🏔️', 1)
  ON CONFLICT (user_id, fund_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_buddy_state IS 'Round 29: unify dream_funds defaults to target=2000, emoji=🏔️ (matches buddy-defaults.ts + RPC)';
