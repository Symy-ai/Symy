/**
 * Feature Flags — centralized runtime configuration
 *
 * 🔧 ARCH fix (2026-07-21): Replaces scattered `(false as boolean)` dead-code
 * patterns with proper env-var-driven feature flags.
 *
 * Why this exists:
 *   Old pattern: `(false as boolean) ? generateIllustration(...) : Promise.resolve(null)`
 *   Problems:
 *     1. Dead code that never executes — confusing to new developers
 *     2. Not configurable — requires code change to re-enable
 *     3. `(false as boolean)` bypasses TypeScript's `if (false)` unreachable-code warning
 *     4. No audit trail — grep can't easily find all disabled features
 *
 *   New pattern: `if (featureFlags.butterflyIllustrationEnabled) { generateIllustration(...) }`
 *   Benefits:
 *     1. Configurable via env var — no code change needed to re-enable
 *     2. TypeScript-safe — no `as boolean` cast
 *     3. Self-documenting — flag name explains what it controls
 *     4. Centralized — all flags in one file, easy to audit
 *
 * Env vars:
 *   BUTTERFLY_ILLUSTRATION_ENABLED  — "true" to enable butterfly story illustrations (default: false)
 *   COMMUNITY_STATS_MULTIPLIER      — multiplier for community stats display (default: 1, set >1 only in dev/staging)
 */

/**
 * Parse a boolean env var. Returns `false` for anything that isn't explicitly "true" (case-insensitive).
 * This is intentionally strict — "1", "yes", "on" all return false. Use "true" to enable.
 */
function parseBoolEnv(value: string | undefined): boolean {
  return value?.toLowerCase() === 'true';
}

/**
 * Parse a positive integer env var. Returns `fallback` for invalid/missing values.
 */
function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) return fallback;
  return n;
}

/**
 * All feature flags in the system. Add new flags here.
 *
 * Naming convention: `<domain><Feature>Enabled` for booleans, `<domain><Metric>` for numbers.
 */
export const featureFlags = {
  /**
   * Butterfly story illustration generation.
   *
   * When false (default), the server skips illustration generation entirely and
   * sends `illustration_failed` SSE events so the client can fall back to
   * CSS-gradient placeholders.
   *
   * Set BUTTERFLY_ILLUSTRATION_ENABLED=true to re-enable server-side illustration
   * generation (requires OPENAI_IMAGE_API_KEY to be set).
   */
  butterflyIllustrationEnabled: parseBoolEnv(process.env.BUTTERFLY_ILLUSTRATION_ENABLED),

  /**
   * Community stats multiplier.
   *
   * ⚠️ This is a growth-hack flag. When > 1, community stats (participant counts,
   * challenge join counts) are multiplied by this factor before being sent to the
   * client. This makes the platform look more active than it really is.
   *
   * Default: 1 (no multiplication — show real numbers)
   * Set to >1 ONLY in dev/staging for demo purposes. NEVER set >1 in production
   * with real users — it violates 道用六·公开 (信息全公开).
   *
   * This flag exists so the multiplier can be removed entirely once the platform
   * has enough real users. The architecture guard `no-hardcoded-community-multiplier`
   * ensures no one re-introduces a hardcoded multiplier.
   */
  communityStatsMultiplier: parsePositiveIntEnv(process.env.COMMUNITY_STATS_MULTIPLIER, 1),
} as const;

/**
 * Type guard for testing — allows tests to override flags without touching process.env.
 * @internal
 */
export function createFeatureFlags(overrides: Partial<typeof featureFlags> = {}): typeof featureFlags {
  return { ...featureFlags, ...overrides };
}
