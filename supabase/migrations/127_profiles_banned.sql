-- Admin user management: ban/unban support
-- Adds banned flags to profiles so /admin/users can disable accounts.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_reason text;

COMMENT ON COLUMN public.profiles.banned IS 'Admin can ban users — true = banned';
COMMENT ON COLUMN public.profiles.banned_until IS 'Temporary ban expiry, NULL = permanent';
COMMENT ON COLUMN public.profiles.banned_reason IS 'Admin note on ban reason';
