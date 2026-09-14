-- Fix: Policy TO anon,authenticated doesn't match the role Supabase API uses
-- with new sb_publishable_ keys. Switch to TO PUBLIC to cover all roles.
-- Email validation is handled by Zod at the API layer.

DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.landing_waitlist;

CREATE POLICY "Anyone can join waitlist"
  ON public.landing_waitlist FOR INSERT
  TO PUBLIC
  WITH CHECK (true);

-- Ensure GRANT covers all roles that might be used
GRANT INSERT ON public.landing_waitlist TO anon, authenticated;
