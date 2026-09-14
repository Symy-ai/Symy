-- ============================================================
-- 120: Fix new user trial_until + profiles creation
-- ============================================================
-- Bug: New users don't get 7-day VIP trial (trial_until is NULL)
-- Root cause: handle_new_user() trigger (migration 106) doesn't set trial_until
--   when creating profiles record. migration 119 only set trial_until for
--   EXISTING users (WHERE trial_until IS NULL), not for future new users.
--
-- Fix:
-- 1. Update handle_new_user() to set trial_until = NOW() + 7 days on INSERT
-- 2. Set trial_until for any existing users with NULL trial_until (safety net)
-- ============================================================

-- 1. Update handle_new_user to set trial_until on new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        -- 🔧 migration 120 fix: Set trial_until = NOW() + 7 days for 7-day VIP trial
        INSERT INTO public.profiles (id, email, display_name, avatar_url, trial_until)
        VALUES (
            new.id,
            new.email,
            COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
            new.raw_user_meta_data->>'avatar_url',
            NOW() + INTERVAL '7 days'
        );
    EXCEPTION WHEN OTHERS THEN
        -- Log error but don't block user creation
        -- Profile can be created later via /api/user/onboarding or admin sync
        RAISE WARNING 'handle_new_user: profiles INSERT failed for user %: %', new.id, SQLERRM;
    END;
    RETURN new;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'migration 120: Set trial_until = NOW() + 7 days on new user creation (7-day VIP trial)';

-- 2. Safety net: Set trial_until for any existing users with NULL trial_until
--    (covers users who registered between migration 106 and 120)
UPDATE profiles
SET trial_until = NOW() + INTERVAL '7 days'
WHERE trial_until IS NULL;

-- 3. Add DEFAULT to trial_until column so future INSERTs without explicit value
--    also get 7 days (defense in depth — trigger is primary, DEFAULT is backup)
ALTER TABLE profiles ALTER COLUMN trial_until SET DEFAULT (NOW() + INTERVAL '7 days');
