-- Supabase migration runner wraps statements in a transaction, so
-- CREATE INDEX CONCURRENTLY is intentionally not used here.
CREATE INDEX IF NOT EXISTS idx_email_receipts_user_status_received
  ON public.email_receipts (user_id, status, received_at DESC);

