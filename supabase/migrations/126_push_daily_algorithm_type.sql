-- Migration 126: Add 'daily_algorithm' to push_notification_log + change reference_id to TEXT
--
-- 🔧 2026-08-05: Push Notification Strategy — 每日算法提醒
--
-- Part 1: Add 'daily_algorithm' to notification_type CHECK constraint
-- Part 2: Change reference_id from UUID to TEXT
--   Reason: daily_algorithm uses date string (YYYY-MM-DD) as reference_id,
--   not a UUID. ALTER TYPE is safe: existing UUID values are auto-cast to text.

-- Part 1: Update CHECK constraint
ALTER TABLE public.push_notification_log DROP CONSTRAINT IF EXISTS push_notification_log_notification_type_check;

ALTER TABLE public.push_notification_log
  ADD CONSTRAINT push_notification_log_notification_type_check
  CHECK (notification_type IN ('miss_you', 'dream_fund_milestone', 'challenge_reminder', 'daily_algorithm'));

-- Part 2: Change reference_id from UUID to TEXT
-- This allows non-UUID reference IDs (e.g. date strings for daily_algorithm)
-- Existing UUID values will be automatically cast to text representation
ALTER TABLE public.push_notification_log ALTER COLUMN reference_id TYPE TEXT;

-- Recreate the UNIQUE constraint (dropping and re-adding, since the type changed)
-- The UNIQUE constraint name follows the table convention
ALTER TABLE public.push_notification_log DROP CONSTRAINT IF EXISTS push_notification_log_user_id_notification_type_reference_id_milestone_key;

ALTER TABLE public.push_notification_log
  ADD CONSTRAINT push_notification_log_user_id_notification_type_reference_id_milestone_key
  UNIQUE (user_id, notification_type, reference_id, milestone);
