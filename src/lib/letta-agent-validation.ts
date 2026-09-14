/**
 * Input validation helpers for letta-agent-manager — extracted to fix
 * P0-3 from AUDIT-LETTA-AGENT-MGR: "No input validation on exported
 * functions — userId/agentId/hourlyRate accepted unchecked."
 *
 * 🔧 ARCH fix (2026-07-18): validate userId/agentId as UUID before any
 *    DB or Letta API call. Prevents:
 *    - Malformed userId reaching Supabase queries (Postgres UUID cast error)
 *    - Admin actions accepting any string for user_id from request body
 *    - Cross-user agent access via crafted agentId
 *
 * Behavior:
 *   - validateUserId: returns true if string is a valid UUID (relaxed —
 *     accepts any hex 8-4-4-4-12 format)
 *   - validateAgentId: same as validateUserId (Letta agent IDs are UUIDs)
 *   - Both return false for empty/undefined/non-string/invalid format
 *
 * Usage pattern:
 *   ```typescript
 *   export async function getUserAgentId(userId: string): Promise<string | null> {
 *     if (!validateUserId(userId)) {
 *       logger.warn('[Letta Agent Manager] Invalid userId:', userId);
 *       return null;
 *     }
 *     // ... existing logic
 *   }
 *   ```
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a UUID (relaxed — accepts any hex 8-4-4-4-12).
 * Returns true for valid UUIDs, false for everything else.
 *
 * 🔧 P0-3 fix: prevents malformed userId from reaching Supabase queries.
 *    Postgres UUID cast error on malformed input causes confusing "not found"
 *    logs that look like the user doesn't exist, when really the input was bad.
 */
export function validateUserId(userId: unknown): userId is string {
  if (typeof userId !== 'string') return false;
  if (userId.length === 0) return false;
  return UUID_RE.test(userId);
}

/**
 * Validate that a string is a valid Letta agent ID (UUID format).
 * Same rules as validateUserId — Letta agent IDs are UUIDs.
 */
export function validateAgentId(agentId: unknown): agentId is string {
  if (typeof agentId !== 'string') return false;
  if (agentId.length === 0) return false;
  return UUID_RE.test(agentId);
}

/**
 * Validate that a value is a positive finite number (for hourlyRate etc).
 */
export function validatePositiveNumber(value: unknown): value is number {
  if (typeof value !== 'number') return false;
  if (!Number.isFinite(value)) return false;
  return value > 0;
}
