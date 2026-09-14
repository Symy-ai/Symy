-- 🔧 P0-2 fix: Clean up old health_events descriptions that contain literal "undefined"/"null"/"NaN"
--
-- Root cause: impulseRecordedDesc() was called with undefined newVitality BEFORE
-- createHealthEvent() computed the actual value. The string "undefined" was
-- stored in the description column.
--
-- This migration:
-- 1. Replaces "→ undefined" / "→ null" / "→ NaN" with empty string (removes the arrow + value)
-- 2. Replaces standalone "undefined" / "null" / "NaN" tokens with "?"
-- 3. Cleans up double question marks "???" → "?"

BEGIN;

-- Step 1: Remove "→ undefined" / "→ null" / "→ NaN" patterns (the buggy vitality transition)
UPDATE public.health_events
SET description = regexp_replace(
  description,
  ' → (undefined|null|NaN)\.?',
  '',
  'gi'
)
WHERE description ~* ' → (undefined|null|NaN)';

-- Step 2: Replace any remaining standalone "undefined" / "null" / "NaN" tokens with "?"
UPDATE public.health_events
SET description = regexp_replace(
  description,
  '\b(undefined|null|NaN)\b',
  '?',
  'gi'
)
WHERE description ~* '\b(undefined|null|NaN)\b';

-- Step 3: Clean up double/triple question marks
UPDATE public.health_events
SET description = regexp_replace(
  description,
  '\?{2,}',
  '?',
  'g'
)
WHERE description ~ '\?{2,}';

-- Step 4: Trim trailing whitespace and dots left by the cleanup
UPDATE public.health_events
SET description = btrim(description, ' .')
WHERE description ~ '[ .]+$';

COMMIT;

-- Verification query (run manually to check):
-- SELECT id, description FROM health_events WHERE description ~* '(undefined|null|NaN)' LIMIT 10;
