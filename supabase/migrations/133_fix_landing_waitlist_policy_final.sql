-- Fix: Ensure INSERT policy exists and works
-- Previous migrations may have left the table without a working INSERT policy
-- This migration drops and recreates with the simplest possible check

DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.landing_waitlist;

CREATE POLICY "Anyone can join waitlist"
  ON public.landing_waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Also verify GRANT is in place (idempotent)
GRANT INSERT ON public.landing_waitlist TO anon, authenticated;
