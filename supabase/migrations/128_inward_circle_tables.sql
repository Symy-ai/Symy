-- ============================================================
-- Inward Circle: Why Wall + Daily Reflection tables
-- Date: 2026-08-07
-- Run manually in Supabase Dashboard
-- ============================================================

-- 1. Why Wall entries
CREATE TABLE IF NOT EXISTS public.inward_why_wall (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 200),
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.inward_why_wall ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public wall)
CREATE POLICY "why_wall_read_all" ON public.inward_why_wall
  FOR SELECT USING (true);

-- Authenticated users can insert their own
CREATE POLICY "why_wall_insert_own" ON public.inward_why_wall
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update/delete their own
CREATE POLICY "why_wall_update_own" ON public.inward_why_wall
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "why_wall_delete_own" ON public.inward_why_wall
  FOR DELETE USING (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_inward_why_wall_order
  ON public.inward_why_wall (display_order DESC, created_at DESC);

-- ============================================================

-- 2. Daily Reflection entries
CREATE TABLE IF NOT EXISTS public.inward_daily_reflection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_key TEXT NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  resonates_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.inward_daily_reflection ENABLE ROW LEVEL SECURITY;

-- Anyone can read
CREATE POLICY "reflection_read_all" ON public.inward_daily_reflection
  FOR SELECT USING (true);

-- Authenticated users can insert their own
CREATE POLICY "reflection_insert_own" ON public.inward_daily_reflection
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update/delete their own
CREATE POLICY "reflection_update_own" ON public.inward_daily_reflection
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "reflection_delete_own" ON public.inward_daily_reflection
  FOR DELETE USING (auth.uid() = user_id);

-- Index for today's prompt query
CREATE INDEX IF NOT EXISTS idx_inward_reflection_prompt_date
  ON public.inward_daily_reflection (prompt_key, created_at DESC);

-- ============================================================

-- 3. Daily Reflection resonates (likes)
CREATE TABLE IF NOT EXISTS public.inward_reflection_resonates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reflection_id UUID REFERENCES public.inward_daily_reflection(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reflection_id, user_id)
);

ALTER TABLE public.inward_reflection_resonates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resonates_read_all" ON public.inward_reflection_resonates
  FOR SELECT USING (true);

CREATE POLICY "resonates_insert_own" ON public.inward_reflection_resonates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "resonates_delete_own" ON public.inward_reflection_resonates
  FOR DELETE USING (auth.uid() = user_id);
