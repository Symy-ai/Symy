-- ============================================================
-- 009: Fix CHECK constraints to support IMAP and chat sources
--
-- BUG-81: impulse_events.source CHECK doesn't include 'chat'
-- BUG-82: email_connections.provider CHECK doesn't include IMAP variants
--
-- These constraints are too restrictive and cause inserts to fail
-- when using IMAP email connections or recording chat-detected impulses.
-- ============================================================

-- BUG-81: Add 'chat' to impulse_events.source CHECK constraint
-- First, drop the old constraint and re-create with 'chat' included
ALTER TABLE public.impulse_events
  DROP CONSTRAINT impulse_events_source_check;

ALTER TABLE public.impulse_events
  ADD CONSTRAINT impulse_events_source_check
  CHECK (source IN ('notification', 'accessibility', 'patrol', 'manual', 'chat'));

-- BUG-82: Update email_connections.provider CHECK to allow IMAP variants
-- Drop old constraint and re-create with imap_ prefix support
ALTER TABLE public.email_connections
  DROP CONSTRAINT email_connections_provider_check;

ALTER TABLE public.email_connections
  ADD CONSTRAINT email_connections_provider_check
  CHECK (provider IN ('gmail', 'outlook') OR provider LIKE 'imap_%');

-- Add comment for documentation
COMMENT ON CONSTRAINT impulse_events_source_check ON public.impulse_events IS
  'Source of the impulse event. Added ''chat'' to support AI-detected impulses from MCP tools.';

COMMENT ON CONSTRAINT email_connections_provider_check ON public.email_connections IS
  'Email provider. Supports gmail, outlook, and imap_ prefixed providers (e.g. imap_163, imap_qq).';
