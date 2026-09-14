-- Fix: RLS WITH CHECK regex blocked all INSERTs
-- PostgreSQL POSIX regex \s handling caused WITH CHECK to always evaluate false
-- Solution: drop the policy with regex, replace with simple length + source check
-- Email format validation is handled by Zod at the API layer

DROP POLICY IF EXISTS "Anyone can join waitlist" ON landing_waitlist;

CREATE POLICY "Anyone can join waitlist"
  ON landing_waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(email) >= 3
    AND length(email) <= 200
    AND source IN ('landing_page')
  );
