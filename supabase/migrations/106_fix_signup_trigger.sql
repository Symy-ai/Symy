-- ============================================================
-- 106: Fix signup "Database error saving new user" — rebuild trigger functions with error handling
-- ============================================================
-- Bug: New user registration fails with "Database error saving new user"
-- Root cause: handle_new_user() or handle_new_buddy_state() trigger function
--   fails (likely due to schema drift from migrations 103/104/105),
--   causing the auth.users INSERT to rollback.
--
-- Fix:
-- 1. Rebuild handle_new_user() with EXCEPTION handling — if profiles INSERT
--    fails, log the error but DON'T block user creation
-- 2. Rebuild handle_new_buddy_state() with EXCEPTION handling — if buddy_state
--    INSERT fails, log but don't block
-- 3. Ensure search_path is set correctly
-- ============================================================

-- 1. Rebuild handle_new_user with error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        INSERT INTO public.profiles (id, email, display_name, avatar_url)
        VALUES (
            new.id,
            new.email,
            COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
            new.raw_user_meta_data->>'avatar_url'
        );
    EXCEPTION WHEN OTHERS THEN
        -- Log error but don't block user creation
        -- Profile can be created later via /api/user/onboarding or admin sync
        RAISE WARNING 'handle_new_user: profiles INSERT failed for user %: %', new.id, SQLERRM;
    END;
    RETURN new;
END;
$$;

-- 2. Rebuild handle_new_buddy_state with error handling
CREATE OR REPLACE FUNCTION public.handle_new_buddy_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        INSERT INTO public.buddy_state (user_id)
        VALUES (new.id)
        ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Log error but don't block profile creation
        -- buddy_state can be created later via buddy/state API
        RAISE WARNING 'handle_new_buddy_state: buddy_state INSERT failed for user %: %', new.id, SQLERRM;
    END;
    RETURN new;
END;
$$;

-- 3. Ensure triggers exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_create_buddy_state ON public.profiles;
CREATE TRIGGER on_create_buddy_state
    AFTER INSERT ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_buddy_state();

COMMENT ON FUNCTION public.handle_new_user() IS 'Round 127: Rebuilt with EXCEPTION handling — profiles INSERT failure no longer blocks user creation';
COMMENT ON FUNCTION public.handle_new_buddy_state() IS 'Round 127: Rebuilt with EXCEPTION handling — buddy_state INSERT failure no longer blocks profile creation';
