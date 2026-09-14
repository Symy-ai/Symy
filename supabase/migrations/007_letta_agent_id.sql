-- ============================================================
-- 007: Add letta_agent_id to profiles
--
-- Each user gets their own Letta Agent for personalized
-- conversations with independent memory and state.
-- The agent is created at account activation (auth callback),
-- NOT lazily on first chat message.
-- ============================================================

-- Add letta_agent_id column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS letta_agent_id TEXT;

-- Index for looking up agent by user
CREATE INDEX IF NOT EXISTS idx_profiles_letta_agent_id ON profiles(letta_agent_id) WHERE letta_agent_id IS NOT NULL;

-- Allow service_role to update letta_agent_id (for API routes)
-- (profiles already has RLS enabled, users can only update their own row)
