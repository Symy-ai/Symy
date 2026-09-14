/**
 * 🔧 P0-2 fix: Display string sanitizer
 *
 * Ensures that JavaScript's `undefined`, `null`, or `NaN` never render as literal
 * strings in the UI. Applied at the rendering layer as a last line of defense.
 *
 * Usage:
 *   import { sanitizeDisplay } from '@/lib/display-sanitize';
 *   <span>{sanitizeDisplay(event.description)}</span>
 */

/**
 * Replaces literal "undefined", "null", "NaN" tokens in a display string with '?'.
 *
 * Handles:
 * - Standalone "undefined" / "null" / "NaN" tokens (word-boundary)
 * - "→ undefined" / "→ null" / "→ NaN" patterns (common in vitality/health logs)
 * - Template-literal artifacts like "value: undefined" or "undefined hours"
 *
 * @param value - The value to sanitize (can be string, number, undefined, null)
 * @param fallback - The fallback string when value itself is nullish (default: '—')
 * @returns A safe display string that never contains literal "undefined"/"null"/"NaN"
 */
export function sanitizeDisplay(
  value: unknown,
  fallback: string = '—',
): string {
  // Handle nullish values at the top level
  if (value === undefined || value === null) {
    return fallback;
  }

  // Convert to string
  let str: string;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return fallback;
    str = String(value);
  } else if (typeof value === 'string') {
    str = value;
  } else {
    // For objects/arrays, try toString, fallback to JSON
    try {
      str = String(value);
    } catch {
      return fallback;
    }
  }

  // Replace literal "undefined", "null", "NaN" tokens
  // Match: word-boundary + (undefined|null|NaN) + word-boundary OR end-of-arrow
  // Examples caught:
  //   "vitality -8 → undefined"     → "vitality -8 → ?"
  //   "undefined hours of life"     → "? hours of life"
  //   "score: NaN"                  → "score: ?"
  //   "value: null"                 → "value: ?"
  str = str.replace(/\b(undefined|null|NaN)\b/gi, '?');

  // Clean up double question marks that might result (e.g., "→ ??" → "→ ?")
  str = str.replace(/\?{2,}/g, '?');

  // Clean up "→ ?" followed by period or end (common pattern)
  // Already handled by the replacement above

  return str;
}

/**
 * Type guard: returns true if the value is a "safe" display value
 * (not undefined, null, or NaN).
 */
export function isSafeDisplayValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'number' && Number.isNaN(value)) return false;
  return true;
}

/**
 * 🔧 P0-2 root-cause fix: Server-side health description sanitizer.
 *
 * Applied in createHealthEvent() and createHealthEventLegacy() BEFORE
 * the description is persisted to the database. This ensures that
 * regardless of which code path generates the description, the DB
 * never stores literal "undefined" / "null" / "NaN" strings.
 *
 * This is the server-side counterpart of sanitizeDisplay(). Together
 * they form a two-layer defense:
 *   Layer 1 (server): sanitizeHealthDescription → clean DB storage
 *   Layer 2 (client): sanitizeDisplay → clean UI rendering
 *
 * @param description - The raw description string (or undefined/null)
 * @returns A sanitized string with no literal undefined/null/NaN tokens
 */
export function sanitizeHealthDescription(description: string | undefined | null): string {
  if (description === undefined || description === null) {
    return 'Event recorded.';
  }
  // Reuse the same regex logic as sanitizeDisplay
  let str = String(description);
  str = str.replace(/\b(undefined|null|NaN)\b/gi, '?');
  str = str.replace(/\?{2,}/g, '?');
  return str;
}
