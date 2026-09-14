-- ============================================================
-- 098_enable_realtime_for_chat_and_health.sql
--
-- 🔧 F13 fix (Round 101): Enable Supabase Realtime for chat_messages and health_events.
--
-- Currently only buddy_state has Realtime. Multi-tab users see stale chat history
-- and health events because there's no push notification — they only get fresh data
-- on tab switch (refetchOnWindowFocus) or manual refresh.
--
-- This migration adds chat_messages and health_events to the supabase_realtime
-- publication. The client already filters by user_id=eq.${user.id} in the
-- Realtime channel filter, so only the user's own changes are received.
--
-- The client-side hooks (use-chat-messages, use-health-events) will need to be
-- updated to subscribe to these Realtime events and invalidate their queries.
-- That's a separate code change — this migration just enables the publication.
-- ============================================================

-- Idempotent: only add if not already in the publication
DO $$
DECLARE
  tbl text;
  already_in_publication boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['chat_messages', 'health_events'] LOOP
    SELECT EXISTS(
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) INTO already_in_publication;

    IF NOT already_in_publication THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
      RAISE NOTICE 'F13: Added % to supabase_realtime publication', tbl;
    ELSE
      RAISE NOTICE 'F13: % already in supabase_realtime publication (skipped)', tbl;
    END IF;
  END LOOP;
END $$;

-- Verify
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
