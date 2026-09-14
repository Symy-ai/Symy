-- ============================================================
-- 088_challenge_deposit_status_processing.sql — Add 'processing' to deposit_status CHECK constraint
--
-- 🔧 ARCH fix Round 78: Round 75 added CAS claim with deposit_status='processing',
--    but migration 079's CHECK constraint only allows ('unsettled', 'deposited', 'skipped').
--    This causes ALL deposit attempts to fail with 409 "being processed by another request"
--    because the UPDATE to 'processing' silently fails (CHECK violation) → claimResult is null.
--
-- Fix: Add 'processing' to the allowed values.
-- ============================================================

-- Drop old CHECK constraint and recreate with 'processing' included
ALTER TABLE public.active_challenges DROP CONSTRAINT IF EXISTS active_challenges_deposit_status_check;

ALTER TABLE public.active_challenges
  ADD CONSTRAINT active_challenges_deposit_status_check
  CHECK (deposit_status IN ('unsettled', 'processing', 'deposited', 'skipped'));
