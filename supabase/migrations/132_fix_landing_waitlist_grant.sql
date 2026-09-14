-- Fix: Grant INSERT privilege to anon role
-- migration 130 created the table and RLS policy, but forgot to GRANT INSERT to anon
-- Without this, RLS policy is irrelevant — Postgres blocks at the table privilege level first
-- Error was: "permission denied for table landing_waitlist" (code 42501)

GRANT INSERT ON public.landing_waitlist TO anon, authenticated;
