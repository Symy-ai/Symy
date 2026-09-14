-- ============================================================
-- 115: Add updated_at triggers + fix migration 096 cron (ARCH-9 #11/#12)
-- ============================================================
-- 🔧 2026-07-15 (ARCH-9 #11/#12 修复)
--
-- Bug 1 (#11): 6 tables have updated_at column but no BEFORE UPDATE trigger
--   → updated_at never auto-updates, app code must manually set it
--   → if app code forgets, updated_at is stale (incorrect cache invalidation)
--
-- Bug 2 (#12): Migration 096 has SELECT cron.schedule() inside DO block
--   without INTO clause → syntax error → weekly challenges cron never scheduled
--
-- Fix:
-- 1. Create generic trigger function + add triggers to 6 tables
-- 2. Re-schedule the weekly challenges cron (if not already scheduled)
-- ============================================================

-- ============================================================
-- Part 1: updated_at triggers
-- ============================================================

-- Generic trigger function (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Add triggers to tables with updated_at but no trigger
-- (Check if trigger exists before creating to be idempotent)

-- profiles
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- buddy_state
DROP TRIGGER IF EXISTS trigger_buddy_state_updated_at ON public.buddy_state;
CREATE TRIGGER trigger_buddy_state_updated_at
  BEFORE UPDATE ON public.buddy_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- heal_sessions (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'heal_sessions' AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_heal_sessions_updated_at ON public.heal_sessions;
    CREATE TRIGGER trigger_heal_sessions_updated_at
      BEFORE UPDATE ON public.heal_sessions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

-- email_connections (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_connections' AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_email_connections_updated_at ON public.email_connections;
    CREATE TRIGGER trigger_email_connections_updated_at
      BEFORE UPDATE ON public.email_connections
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

-- admin_jobs (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'admin_jobs' AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_admin_jobs_updated_at ON public.admin_jobs;
    CREATE TRIGGER trigger_admin_jobs_updated_at
      BEFORE UPDATE ON public.admin_jobs
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

-- letta_agent_pool_config (if exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'letta_agent_pool_config' AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_letta_agent_pool_config_updated_at ON public.letta_agent_pool_config;
    CREATE TRIGGER trigger_letta_agent_pool_config_updated_at
      BEFORE UPDATE ON public.letta_agent_pool_config
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

-- ============================================================
-- Part 2: Fix migration 096 weekly challenges cron
-- ============================================================
-- Migration 096 used SELECT cron.schedule() inside DO block without INTO
-- → syntax error → cron never scheduled
-- Fix: Use PERFORM (correct syntax for void function calls in DO blocks)
-- Note: Use distinct dollar-quote tags to avoid conflicts

DO $cronblock$
BEGIN
  -- Check if cron extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule any existing weekly challenges cron (idempotent)
    PERFORM cron.unschedule('weekly_challenges_seed');
    -- Re-schedule: every Monday 00:00 UTC
    PERFORM cron.schedule('weekly_challenges_seed', '0 0 * * 1', $cmd$SELECT public.create_weekly_challenges(0)$cmd$);
    RAISE NOTICE 'Scheduled weekly_challenges_seed cron (Monday 00:00 UTC)';
  ELSE
    RAISE NOTICE 'pg_cron extension not available — skipping cron schedule';
  END IF;
END;
$cronblock$;

COMMENT ON FUNCTION public.update_updated_at_column() IS
  '2026-07-15 (ARCH-9 #11): Generic updated_at trigger function — auto-updates updated_at on row modification';
