-- 066: Re-grant authenticated on apply_buddy_state_delta (Round 23 API C1)
--
-- 🔧 ARCH fix (Round 23 audit C1 — migration 065 re-revoked authenticated):
--    050 D1 specifically GRANTed apply_buddy_state_delta TO authenticated
--    because dream-funds/route.ts uses createAuthenticatedClient (not admin client).
--    065 copy-pasted REVOKE ALL ... FROM anon, authenticated — re-introducing
--    the exact bug 050 D1 fixed. Every dream-fund DELETE falls back to non-atomic.
--    根因修复: 重新 GRANT TO authenticated (043 auth guard 防跨用户滥用)。

GRANT EXECUTE ON FUNCTION public.apply_buddy_state_delta(UUID, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT[], TEXT, NUMERIC, INTEGER, INTEGER, INTEGER) TO authenticated;

-- 🔧 ARCH fix (Round 23 audit C2 — create_health_event_atomic auto-create leaves dream_funds='[]'):
--    065's create_health_event_atomic auto-create does INSERT INTO buddy_state (user_id) VALUES (...)
--    relying on column default '[]' for dream_funds. But apply_buddy_state_delta inserts canonical
--    defaults. Inconsistency → refund_boost on auto-created row finds no fund → refund vanishes.
--    根因修复: ALTER COLUMN dream_funds SET DEFAULT to canonical JSONB.

ALTER TABLE public.buddy_state ALTER COLUMN dream_funds SET DEFAULT
  '[{"id":"df-1","name":"Credit Card Payoff","target":2000,"current":0,"emoji":"💳"},{"id":"df-2","name":"Iceland Trip","target":5000,"current":0,"emoji":"🏔️"}]'::jsonb;

COMMENT ON FUNCTION public.apply_buddy_state_delta IS 'Round 23 C1: re-grant authenticated (050 D1 fix restored)';
COMMENT ON TABLE public.buddy_state IS 'Round 23 C2: dream_funds column default set to canonical JSONB';
