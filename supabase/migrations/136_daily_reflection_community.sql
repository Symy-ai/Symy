-- ============================================================
-- Daily Reflection community table + seed data + RPC
-- Notes:
-- - user_id is nullable because seed rows have no real user.
--   is_seed=true => system-seeded content; user_id will be null.
-- - Client UPDATE is not allowed; resonates changes use RPC.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.daily_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar text NOT NULL DEFAULT '🌙',
  text text NOT NULL CHECK (char_length(trim(text)) BETWEEN 1 AND 500),
  resonates integer NOT NULL DEFAULT 0,
  is_seed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_reflections ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_daily_reflections_created_at
  ON public.daily_reflections (created_at DESC);

-- RLS policies
DROP POLICY IF EXISTS "reflection_select_authenticated" ON public.daily_reflections;
CREATE POLICY "reflection_select_authenticated"
  ON public.daily_reflections FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reflection_insert_own" ON public.daily_reflections;
CREATE POLICY "reflection_insert_own"
  ON public.daily_reflections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Seed content (3 existing mock entries, now persisted as community content)
INSERT INTO public.daily_reflections (avatar, text, resonates, is_seed)
VALUES
  ('🦋', 'I realized I was buying things to feel in control. Now I journal instead.', 42, true),
  ('🌊', 'A $200 jacket I already forgot I wanted. Glad I waited.', 28, true),
  ('🍃', 'The quiet after not buying was louder than the dopamine of buying.', 35, true);

-- Vote dedup table + one-vote-per-user RPC
CREATE TABLE IF NOT EXISTS public.daily_reflection_votes (
  reflection_id uuid NOT NULL REFERENCES public.daily_reflections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reflection_id, user_id)
);

ALTER TABLE public.daily_reflection_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vote_select_authenticated" ON public.daily_reflection_votes;
CREATE POLICY "vote_select_authenticated"
  ON public.daily_reflection_votes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vote_insert_own" ON public.daily_reflection_votes;
CREATE POLICY "vote_insert_own"
  ON public.daily_reflection_votes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.increment_resonates(target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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
