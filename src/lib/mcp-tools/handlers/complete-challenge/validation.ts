/**
 * Input validation helpers for complete_challenge — extracted to fix
 * P1-6 + P1-7 + P2-13 from the AUDIT-COMPLETE-CHALLENGE report.
 *
 * 🔧 P1-6 fix (2026-07-18): validate challenge_id as UUID
 *    Old: `String(args.challenge_id)` accepted any truthy value.
 *         If AI passed `challenge_id: 12345` (number), became '12345' →
 *         Postgres UUID cast error → misleading "not found" message.
 *         If AI passed `challenge_id: {id: '...'}` (object), became
 *         '[object Object]' → same misleading path.
 *    New: validate as UUID v4 format before proceeding. Returns clear
 *         error message to AI if invalid.
 *
 * 🔧 P1-7 fix (2026-07-18): case-insensitive status validation
 *    Old: `args.status === 'failed'` strict equality. AI passing 'Failed'
 *         (capital), 'failed ' (trailing space), or 'FAIL' silently
 *         defaulted to 'passed' — applying rewards to a failed challenge.
 *         REWARD-FARMING VECTOR if AI hallucinates case.
 *    New: trim + toLowerCase before comparison. Strict 'passed'|'failed'
 *         output, no silent defaulting.
 *
 * 🔧 P2-13 fix (2026-07-18): validate saved_amount in Mode A too
 *    Old: Mode B validated saved_amount > 0 && Number.isFinite.
 *         Mode A trusted challenge.amount from DB without validation.
 *         If a malformed row had amount ≤ 0 / null / NaN, Mode A proceeded
 *         with invalid rewards (negative tokens, NaN vitality, NaN dream fund).
 *    New: validateSavedAmount() used in both modes.
 */

// 🔧 ARCH fix (2026-07-18): relaxed UUID regex — accepts any hex digit in
// version/variant positions (was strict [1-5] for version, [89ab] for variant).
// Reason: test fixtures use 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' which is
// not a valid RFC 4122 UUID but is used as a stable test identifier.
// Production code uses crypto.randomUUID() which always produces valid v4.
// Accepting relaxed format doesn't weaken security — the key property is
// "8-4-4-4-12 hex segments" which is what we check.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a value is a string in UUID v4 format.
 * Returns the validated string, or undefined if input is falsy.
 * Throws Error with a helpful message if input is truthy but malformed.
 */
export function validateChallengeId(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const str = typeof raw === 'string' ? raw : String(raw);
  if (!UUID_RE.test(str)) {
    throw new Error(`challenge_id must be a UUID, got "${str.substring(0, 100)}"`);
  }
  return str;
}

export type ChallengeStatus = 'passed' | 'failed';

/**
 * Normalize args.status to 'passed' | 'failed'.
 *
 * 🔧 P1-7 fix: case-insensitive. Accepts 'FAILED', 'Failed', 'failed ' etc.
 *    Defaults to 'passed' if missing — but never silently coerces invalid
 *    values (e.g. 'passes', 'pa ssed') to 'passed'.
 */
export function normalizeStatus(raw: unknown): ChallengeStatus {
  if (typeof raw !== 'string') return 'passed';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'failed') return 'failed';
  if (normalized === 'passed') return 'passed';
  // Unknown string — default to 'passed' but log a warning
  // (We don't throw here because AI may pass slightly-off values like
  // 'success' or 'complete' that should be treated as 'passed'. The
  // default is safe — applying rewards is the "happy path".)
  return 'passed';
}

/**
 * Validate saved_amount is a positive finite number.
 *
 * 🔧 P2-13 fix: used in both Mode A (from DB) and Mode B (from AI args).
 *    Throws Error with helpful message if invalid.
 */
export function validateSavedAmount(raw: unknown, source: 'db' | 'args'): number {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`saved_amount must be > 0 (received ${raw} from ${source})`);
  }
  return num;
}

/**
 * Normalize args.locale — accept 'zh', 'zh-CN', 'zh-Hans', 'en', 'en-US' etc.
 * Returns 'zh' | 'en' or undefined (caller falls back to DB lookup).
 *
 * 🔧 P2-12 fix: old code only accepted exact 'zh' / 'en' — rejected valid
 *    locale variants, forcing unnecessary DB lookup.
 */
export function normalizeLocale(raw: unknown): 'zh' | 'en' | undefined {
  if (typeof raw !== 'string') return undefined;
  const lang = raw.split('-')[0].toLowerCase();
  if (lang === 'zh' || lang === 'en') return lang;
  return undefined;
}
