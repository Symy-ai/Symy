-- Supabase migration runner wraps statements in a transaction, so
-- CREATE INDEX CONCURRENTLY is intentionally not used here.
CREATE INDEX IF NOT EXISTS idx_active_challenges_user_status_completed
  ON public.active_challenges (user_id, status, completed_at DESC);

