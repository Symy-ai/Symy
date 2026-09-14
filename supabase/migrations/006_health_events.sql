-- ============================================================
-- 006: Health Events Table
--
-- Tracks every vitality change on the companion, linking it
-- back to the spending event (impulse purchase, refund, etc.)
-- that caused it. This makes the core mechanic visible:
--
--   "Your companion's health is tied to your spending habits.
--    Impulse purchases hurt it, mindful spending helps it thrive!"
-- ============================================================

CREATE TABLE IF NOT EXISTS health_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What kind of event caused the vitality change
  event_type  TEXT NOT NULL CHECK (
    event_type IN (
      'impulse_damage',      -- Impulse purchase detected via email
      'impulse_confessed',   -- User admitted impulse purchase in chat (MCP)
      'mindful_recovery',    -- User resisted / ignored impulse
      'refund_boost',        -- User got a refund
      'challenge_reward',    -- User completed a challenge (MCP)
      'passive_recovery',    -- Daily passive recovery from streak
      'drain',               -- Natural token/vitality drain
      'revive',              -- Companion revived after dormant
      'manual_adjustment'    -- Admin or correction adjustment
    )
  ),

  -- How much vitality changed (negative = damage, positive = recovery)
  vitality_change INTEGER NOT NULL,
  -- Vitality value after the change
  new_vitality    INTEGER NOT NULL,
  -- Token change (if applicable)
  token_change    INTEGER NOT NULL DEFAULT 0,

  -- What triggered this event
  trigger_source  TEXT NOT NULL CHECK (
    trigger_source IN (
      'email_receipt',   -- Email receipt scan detected
      'email_refund',    -- Receipt status changed to refunded
      'email_ignore',    -- Receipt status changed to ignored (resisted)
      'chat_mcp',        -- AI called MCP tool during conversation
      'passive_daily',   -- Daily passive recovery check
      'token_drain',     -- Natural drain timer
      'revive_deposit',  -- User deposited to revive
      'manual'           -- Manual/admin action
    )
  ),

  -- Optional: Link to the specific receipt or event that caused this
  trigger_id      TEXT,

  -- Human-readable description for the health event log
  description     TEXT NOT NULL,

  -- Additional metadata
  metadata        JSONB DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index: Get recent events for a user (used in BuddyTab health log)
CREATE INDEX IF NOT EXISTS idx_health_events_user_created
  ON health_events (user_id, created_at DESC);

-- Index: Get events by type for analytics
CREATE INDEX IF NOT EXISTS idx_health_events_type
  ON health_events (user_id, event_type);

-- RLS
ALTER TABLE health_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own health events"
  ON health_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own health events"
  ON health_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for API routes using admin client)
CREATE POLICY "Service role full access on health_events"
  ON health_events FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- Add service_role RLS policy to buddy_state (BUG-10 fix)
-- Ensures admin client can always read/write buddy_state
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'buddy_state' AND policyname = 'Service role full access on buddy_state'
  ) THEN
    CREATE POLICY "Service role full access on buddy_state"
      ON buddy_state FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================================
-- Also add onboarding_completed column if not exists
-- (Was in 006_onboarding.sql from previous session)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
  END IF;
END $$;
