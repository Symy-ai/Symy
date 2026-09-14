/**
 * Tests for src/lib/utils.ts — pure helper functions
 *
 * 🔧 ARCH fix (Round 76 ARCH-DEEP-76): 测试覆盖率 — utils.ts 0 tests → +N tests
 *
 * Scope: ONLY pure functions (no DB / no API / no Supabase).
 *   - cn (twMerge + clsx)
 *   - formatPlatformName (lookup table + fallback transform)
 *   - calculateDaysStreak (date arithmetic via date-fns)
 *   - truncate (text truncation with suffix)
 *   - formatDate (ISO → localized display via date-fns)
 *   - formatTimeAgo (relative time string)
 *
 * Edge cases covered (focus per task: formatPlatformName):
 *   - All known platforms (10 entries in PLATFORM_NAMES)
 *   - Case-insensitive lookup ('TIKTOK_SHOP' → 'TikTok Shop')
 *   - Unknown platform fallback ('random_store' → 'Random Store')
 *   - Empty string
 *   - Hyphenated / numeric unknown platforms
 *
 * Time-dependent functions (calculateDaysStreak, formatTimeAgo) use
 * vi.useFakeTimers + vi.setSystemTime for deterministic assertions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cn,
  formatPlatformName,
  calculateDaysStreak,
  truncate,
  formatDate,
  formatTimeAgo,
} from '@/lib/utils';

// ============================================================
// cn — tailwind className merge
// ============================================================

describe('cn', () => {
  it('merges simple strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles single arg', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('handles no args', () => {
    expect(cn()).toBe('');
  });

  it('dedupes conflicting tailwind classes (twMerge)', () => {
    // twMerge: last conflicting class wins
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('preserves non-conflicting classes', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
  });

  it('handles conditional via clsx (object syntax)', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });

  it('handles conditional via clsx (array syntax)', () => {
    expect(cn(['a', 'b', false && 'c', 'd'])).toBe('a b d');
  });

  it('handles undefined / null inputs (clsx filters)', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });

  it('dedupes conflicting classes across conditional inputs', () => {
    expect(cn('px-2', { 'px-4': true, 'py-2': true })).toBe('px-4 py-2');
  });
});

// ============================================================
// formatPlatformName — the headline target (Round 76)
// ============================================================

describe('formatPlatformName', () => {
  // --- All 10 known platforms in PLATFORM_NAMES lookup table ---

  it('maps tiktok_shop → "TikTok Shop" (canonical case)', () => {
    expect(formatPlatformName('tiktok_shop')).toBe('TikTok Shop');
  });

  it('maps amazon → "Amazon"', () => {
    expect(formatPlatformName('amazon')).toBe('Amazon');
  });

  it('maps target → "Target"', () => {
    expect(formatPlatformName('target')).toBe('Target');
  });

  it('maps walmart → "Walmart"', () => {
    expect(formatPlatformName('walmart')).toBe('Walmart');
  });

  it('maps shein → "SHEIN" (uppercase override)', () => {
    expect(formatPlatformName('shein')).toBe('SHEIN');
  });

  it('maps temu → "Temu"', () => {
    expect(formatPlatformName('temu')).toBe('Temu');
  });

  it('maps ebay → "eBay" (camelCase override)', () => {
    expect(formatPlatformName('ebay')).toBe('eBay');
  });

  it('maps shopify → "Shopify"', () => {
    expect(formatPlatformName('shopify')).toBe('Shopify');
  });

  it('maps gmail → "Gmail"', () => {
    expect(formatPlatformName('gmail')).toBe('Gmail');
  });

  it('maps outlook → "Outlook"', () => {
    expect(formatPlatformName('outlook')).toBe('Outlook');
  });

  // --- Case-insensitive lookup (uses .toLowerCase()) ---

  it('handles UPPERCASE input (TIKTOK_SHOP)', () => {
    expect(formatPlatformName('TIKTOK_SHOP')).toBe('TikTok Shop');
  });

  it('handles MixedCase input (TikTok_Shop)', () => {
    expect(formatPlatformName('TikTok_Shop')).toBe('TikTok Shop');
  });

  it('handles uppercase known platform (AMAZON)', () => {
    expect(formatPlatformName('AMAZON')).toBe('Amazon');
  });

  it('handles uppercase known platform (SHEIN → "SHEIN" not "Shein")', () => {
    // Case-insensitive lookup ensures the canonical SHEIN is returned
    expect(formatPlatformName('SHEIN')).toBe('SHEIN');
    expect(formatPlatformName('Shein')).toBe('SHEIN');
  });

  // --- Unknown platforms: fallback to title-cased name ---

  it('fallback: replaces _ with space and title-cases (random_store)', () => {
    expect(formatPlatformName('random_store')).toBe('Random Store');
  });

  it('fallback: title-cases multi-word unknown (some_random_store)', () => {
    expect(formatPlatformName('some_random_store')).toBe('Some Random Store');
  });

  it('fallback: handles already-camelCased unknown (RandomStore → "RandomStore")', () => {
    // No underscores to replace; \b\w matches only at start (no internal word boundary)
    expect(formatPlatformName('RandomStore')).toBe('RandomStore');
  });

  it('fallback: lowercase single word unknown (costco)', () => {
    expect(formatPlatformName('costco')).toBe('Costco');
  });

  it('fallback: handles hyphenated unknown (some-store)', () => {
    // Hyphen is a word boundary in \b — both segments get capitalized
    expect(formatPlatformName('some-store')).toBe('Some-Store');
  });

  it('fallback: handles numeric suffix (store123)', () => {
    expect(formatPlatformName('store123')).toBe('Store123');
  });

  it('fallback: handles leading-underscore (rare, but defensive)', () => {
    // _foo → ' foo' (underscore → space, leading space) → title-case at boundary → ' Foo'
    expect(formatPlatformName('_foo')).toBe(' Foo');
  });

  // --- Empty string edge case ---

  it('returns empty string for empty input', () => {
    expect(formatPlatformName('')).toBe('');
  });

  // --- Whitespace edge case (defensive — not a real platform but should not crash) ---

  it('does not crash on whitespace-only input', () => {
    // ' ' has no _, no \b\w matches (whitespace is not \w), returns ' '
    expect(formatPlatformName(' ')).toBe(' ');
  });
});

// ============================================================
// truncate — text truncation
// ============================================================

describe('truncate', () => {
  it('returns undefined for null input', () => {
    expect(truncate(null, 10)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(truncate(undefined, 10)).toBeUndefined();
  });

  it('returns text as-is when shorter than max', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('returns text as-is when exactly at max', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });

  it('truncates and appends default suffix "…" when over max', () => {
    expect(truncate('1234567890', 5)).toBe('12345…');
  });

  it('supports custom suffix', () => {
    expect(truncate('1234567890', 5, '...[truncated]')).toBe('12345...[truncated]');
  });

  it('supports empty suffix', () => {
    expect(truncate('1234567890', 5, '')).toBe('12345');
  });

  it('handles max=0 by returning just the suffix', () => {
    expect(truncate('hello', 0)).toBe('…');
  });

  it('handles empty string (length 0, never exceeds max)', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('handles Unicode text (documents UTF-16 code-unit behavior, NOT code-point aware)', () => {
    // '😀' has length 2 in JS (surrogate pair); truncate slices by UTF-16 code units.
    // truncate('😀😀😀', 3) → slice(0,3) cuts the 2nd emoji's surrogate pair in half,
    // producing a lone surrogate '�' followed by '…'.
    // This documents the existing (non-emoji-aware) behavior — NOT a bug to fix here.
    const result = truncate('😀😀😀', 3);
    expect(result).toBeDefined();
    expect(result!.endsWith('…')).toBe(true);
    expect(result!.length).toBe(4); // 3 code units + suffix '…' (which is 1 BMP char)
  });

  it('handles BMP Unicode (non-surrogate) text normally', () => {
    // CJK / accented Latin chars are single UTF-16 code units — truncate works as expected.
    expect(truncate('你好世界测试', 4)).toBe('你好世界…');
    // 'café' is 4 chars; max=4 → no truncation (text.length === max)
    expect(truncate('café', 4)).toBe('café');
    // 'café_restaurant' is 15 chars; max=5 → slice(0,5)='café_' + '…' = 'café_…'
    expect(truncate('café_restaurant', 5)).toBe('café_…');
  });

  it('does not mutate input (pure)', () => {
    const input = 'abcdefghijklmnop';
    truncate(input, 5);
    expect(input).toBe('abcdefghijklmnop');
  });
});

// ============================================================
// formatDate — ISO → localized display via date-fns
// ============================================================

describe('formatDate', () => {
  it('formats valid ISO date without time (default)', () => {
    // Nov 23, 2025
    expect(formatDate('2025-11-23T14:30:00Z', 'en', false)).toBe('Nov 23, 2025');
  });

  it('formats valid ISO date with time', () => {
    // includeTime=true → 'MMM d, yyyy, h:mm a'
    const result = formatDate('2025-11-23T14:30:00Z', 'en', true);
    // Time component varies by local timezone; verify date prefix and time pattern
    expect(result).toMatch(/^Nov 23, 2025, \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('defaults locale to "en" when not specified', () => {
    // _locale param is unused (currently); verify it doesn't break
    expect(formatDate('2025-11-23T14:30:00Z')).toBe('Nov 23, 2025');
  });

  it('handles date-only ISO string (no time component)', () => {
    expect(formatDate('2025-11-23')).toBe('Nov 23, 2025');
  });

  it('handles ISO with explicit timezone offset', () => {
    // 2025-01-01T00:00:00-05:00 = 2025-01-01T05:00:00Z
    // In UTC environment: 'Jan 1, 2025'
    // We only assert the date portion since local TZ may shift
    const result = formatDate('2025-01-01T00:00:00-05:00');
    expect(result).toMatch(/^Jan 1, 2025$/);
  });

  it('returns original iso string for invalid date (catch block fallback)', () => {
    // new Date('not-a-date') → Invalid Date; date-fns format throws → catch returns iso
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });

  it('returns original iso string for empty input', () => {
    // new Date('') → Invalid Date; format throws → catch returns ''
    expect(formatDate('')).toBe('');
  });

  it('formats single-digit day without leading zero (date-fns "d" not "dd")', () => {
    expect(formatDate('2025-01-05')).toBe('Jan 5, 2025');
  });

  it('handles year-only input (date-fns accepts)', () => {
    // new Date('2025') → Jan 01 2025 00:00:00 local; date-fns formats
    // Result depends on TZ but year and month should be Jan 2025
    const result = formatDate('2025');
    expect(result).toMatch(/^Jan 1, 2025$/);
  });
});

// ============================================================
// formatTimeAgo — relative time string
// ============================================================

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for current time (diff < 60s)', () => {
    expect(formatTimeAgo(new Date('2025-01-15T12:00:00.000Z'))).toBe('just now');
  });

  it('returns "just now" for 30 seconds ago', () => {
    expect(formatTimeAgo(new Date('2025-01-15T11:59:30.000Z'))).toBe('just now');
  });

  it('returns "1m ago" for 90 seconds ago', () => {
    expect(formatTimeAgo(new Date('2025-01-15T11:58:30.000Z'))).toBe('1m ago');
  });

  it('returns "Xm ago" for 30 minutes ago', () => {
    expect(formatTimeAgo(new Date('2025-01-15T11:30:00.000Z'))).toBe('30m ago');
  });

  it('returns "59m ago" for 59 minutes 59 seconds ago (boundary)', () => {
    expect(formatTimeAgo(new Date('2025-01-15T11:00:01.000Z'))).toBe('59m ago');
  });

  it('returns "1h ago" for 1 hour ago (boundary: diff = 3_600_000 not < 3_600_000)', () => {
    expect(formatTimeAgo(new Date('2025-01-15T11:00:00.000Z'))).toBe('1h ago');
  });

  it('returns "Xh ago" for 5 hours ago', () => {
    expect(formatTimeAgo(new Date('2025-01-15T07:00:00.000Z'))).toBe('5h ago');
  });

  it('returns "23h ago" for 23 hours ago (boundary just before 1d)', () => {
    expect(formatTimeAgo(new Date('2025-01-14T12:00:01.000Z'))).toBe('23h ago');
  });

  it('returns "1d ago" for 1 day ago', () => {
    expect(formatTimeAgo(new Date('2025-01-14T12:00:00.000Z'))).toBe('1d ago');
  });

  it('returns "7d ago" for 7 days ago', () => {
    expect(formatTimeAgo(new Date('2025-01-08T12:00:00.000Z'))).toBe('7d ago');
  });

  it('returns "366d ago" for 1 year ago (2024 was a leap year)', () => {
    // 2024-01-15 → 2025-01-15 spans 366 days (leap year Feb 29 included)
    expect(formatTimeAgo(new Date('2024-01-15T12:00:00.000Z'))).toBe('366d ago');
  });

  it('returns "365d ago" for Jan 16 2024 (365 days back from Jan 15 2025, leap year)', () => {
    // 2024-01-16 → 2025-01-15 = 366 days (Jan 16 2024 → Jan 16 2025, leap) - 1 day = 365 days
    expect(formatTimeAgo(new Date('2024-01-16T12:00:00.000Z'))).toBe('365d ago');
  });

  it('returns empty string for invalid date (Round 116 fix: graceful fallback)', () => {
    // 🔧 Round 116: formatTimeAgo now uses formatRelativeTimeShort which returns ''
    // for invalid dates (isNaN check), instead of the old 'NaNd ago' garbage.
    expect(formatTimeAgo(new Date('invalid'))).toBe('');
  });

  it('returns empty string for Date constructed from NaN (Round 116 fix)', () => {
    expect(formatTimeAgo(new Date(NaN))).toBe('');
  });
});

// ============================================================
// calculateDaysStreak — consecutive days without impulse spending
// ============================================================

describe('calculateDaysStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Use local midnight to align with date-fns format() which uses local TZ
    // Setting to 2025-01-15 12:00 local ensures today's date is Jan 15, 2025
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 for empty receipts array', () => {
    expect(calculateDaysStreak([])).toBe(0);
  });

  it('returns 1 when no impulse purchases and earliest receipt is today', () => {
    // Today only, no impulse → streak counts today (1)
    const receipts = [
      { received_at: '2025-01-15T10:00:00', impulse_score: 30 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(1);
  });

  it('counts consecutive days backward from today when no impulse purchases', () => {
    // Receipts span 3 days, no impulse → streak = 3 (today + 2 days back)
    const receipts = [
      { received_at: '2025-01-13T10:00:00', impulse_score: 30 },
      { received_at: '2025-01-14T10:00:00', impulse_score: 40 },
      { received_at: '2025-01-15T10:00:00', impulse_score: 30 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(3);
  });

  it('returns 0 when today has an impulse purchase (score >= 60)', () => {
    const receipts = [
      { received_at: '2025-01-15T10:00:00', impulse_score: 65 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(0);
  });

  it('returns 0 when today has impulse score exactly 60 (boundary, >= 60)', () => {
    const receipts = [
      { received_at: '2025-01-15T10:00:00', impulse_score: 60 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(0);
  });

  it('counts streak up to yesterday when today has no impulse but yesterday does', () => {
    // Today: no impulse; yesterday: impulse → streak = 1 (only today)
    const receipts = [
      { received_at: '2025-01-15T10:00:00', impulse_score: 30 },
      { received_at: '2025-01-14T10:00:00', impulse_score: 65 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(1);
  });

  it('treats score 59 as NOT impulse (strict less than 60)', () => {
    // Score 59 → not impulse; today's receipt counts toward streak
    const receipts = [
      { received_at: '2025-01-15T10:00:00', impulse_score: 59 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(1);
  });

  it('handles multiple impulse days — streak breaks at most recent impulse day', () => {
    // Impulse on Jan 12 and Jan 14, today (Jan 15) no impulse → streak = 1
    const receipts = [
      { received_at: '2025-01-12T10:00:00', impulse_score: 70 },
      { received_at: '2025-01-14T10:00:00', impulse_score: 75 },
      { received_at: '2025-01-15T10:00:00', impulse_score: 20 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(1);
  });

  it('stops streak at impulse day even if older non-impulse days exist before it', () => {
    // Impulse on Jan 13, non-impulse on Jan 11/12 (older) → streak = 2 (today + Jan 14)
    // (Streak stops at Jan 13 which has impulse)
    const receipts = [
      { received_at: '2025-01-11T10:00:00', impulse_score: 20 },
      { received_at: '2025-01-12T10:00:00', impulse_score: 20 },
      { received_at: '2025-01-13T10:00:00', impulse_score: 70 },
      { received_at: '2025-01-14T10:00:00', impulse_score: 20 },
      { received_at: '2025-01-15T10:00:00', impulse_score: 20 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(2);
  });

  it('caps max streak at 365 when no earliest receipt limits it (defensive)', () => {
    // No receipts → empty array case already returns 0.
    // With one receipt from 2 years ago and no impulse: streak capped at 365.
    const receipts = [
      { received_at: '2023-01-15T10:00:00', impulse_score: 20 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(365);
  });

  it('caps max streak at (today - earliestReceipt + 1) when earliest < 365 days ago', () => {
    // Earliest = Jan 10 (5 days back) → maxDays = 6; no impulse → streak = 6
    const receipts = [
      { received_at: '2025-01-10T10:00:00', impulse_score: 20 },
      { received_at: '2025-01-13T10:00:00', impulse_score: 20 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(6);
  });

  it('does NOT count a non-impulse day older than earliest receipt', () => {
    // Earliest = Jan 13 → maxDays = 3 (today, yesterday, Jan 13)
    // All non-impulse → streak = 3 (capped by earliestDate boundary)
    const receipts = [
      { received_at: '2025-01-13T10:00:00', impulse_score: 20 },
      { received_at: '2025-01-15T10:00:00', impulse_score: 20 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(3);
  });

  it('handles unsorted receipts (earliest detected via min comparison)', () => {
    // Receipts in non-chronological order; earliest = Jan 12 → maxDays = 4
    // Jan 13 has impulse → streak = 2 (today + Jan 14)
    const receipts = [
      { received_at: '2025-01-15T10:00:00', impulse_score: 20 },
      { received_at: '2025-01-12T10:00:00', impulse_score: 20 },
      { received_at: '2025-01-14T10:00:00', impulse_score: 20 },
      { received_at: '2025-01-13T10:00:00', impulse_score: 65 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(2);
  });

  it('dedupes impulse purchases on the same day (Set semantics)', () => {
    // Two impulse receipts today → still streak = 0 (one entry in Set)
    const receipts = [
      { received_at: '2025-01-15T10:00:00', impulse_score: 65 },
      { received_at: '2025-01-15T14:00:00', impulse_score: 75 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(0);
  });

  it('treats different times on same day as same streak-day (date-fns format yyyy-MM-dd)', () => {
    // Two non-impulse receipts today at different times → still streak = 1
    const receipts = [
      { received_at: '2025-01-15T08:00:00', impulse_score: 30 },
      { received_at: '2025-01-15T20:00:00', impulse_score: 40 },
    ];
    expect(calculateDaysStreak(receipts)).toBe(1);
  });
});
