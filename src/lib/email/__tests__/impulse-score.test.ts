/**
 * Tests for email/impulse-score.ts — calculateEmailImpulseScore + extractPlainText
 *
 * 🔧 ARCH fix (Round 73 ARCH-DEEP-73): 测试覆盖率 — impulse-score 0 tests → 40+ tests
 *
 * calculateEmailImpulseScore 是纯函数 (critical for AI 行为):
 *   - Base 30 + amount tiers (25/15/10/5/0)
 *   - Hour tiers (late night +15 / evening +8 / daytime +0)
 *   - Impulse platform bonus (+15 for tiktok_shop/temu/shein)
 *   - Confidence penalty (-10 if < 0.5)
 *   - Clamp [0, 100]
 *
 * extractPlainText:
 *   - Plain text (no HTML tags) → trimmed as-is
 *   - HTML → html-to-text conversion
 *   - Round 22 fix: "if x < 5 then y > 3" NOT treated as HTML
 *
 * Timezone strategy: All hour tests use userTimezone='UTC' + UTC Date strings
 * for deterministic behavior regardless of test runner's local timezone.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEmailImpulseScore,
  extractPlainText,
} from '@/lib/email/impulse-score';

// ============================================================
// Helper: build a parsed receipt object
// ============================================================
function makeParsed(overrides: Partial<{ platform: string; amount?: number; confidence: number }> = {}): {
  platform: string;
  amount?: number;
  confidence: number;
} {
  return {
    platform: 'unknown',
    confidence: 0.95,
    ...overrides,
  };
}

// Helper: build a Date at a specific UTC hour (deterministic across timezones)
function dateAtUtcHour(hour: number, day = 1): Date {
  // 2024-01-{day}T{hour}:00:00Z
  return new Date(Date.UTC(2024, 0, day, hour, 0, 0));
}

// ============================================================
// calculateEmailImpulseScore — Base score
// ============================================================

describe('calculateEmailImpulseScore — base score', () => {
  it('returns base 30 with no amount, daytime, unknown platform, high confidence', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30);
  });

  it('returns base 30 + late night bonus at midnight UTC (hour 0)', () => {
    // hour 0 → late night bonus +15 → 30 + 15 = 45
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(0),
      'UTC',
    );
    expect(score).toBe(45);
  });
});

// ============================================================
// calculateEmailImpulseScore — Amount tiers
// ============================================================

describe('calculateEmailImpulseScore — amount tiers', () => {
  it('adds +25 for amount > 100', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: 101, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(55); // 30 + 25
  });

  it('adds +25 for very large amount (1000)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: 1000, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(55); // 30 + 25
  });

  it('adds +15 for amount > 50 (boundary 51)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: 51, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +15 for amount = 100 (boundary: not > 100)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: 100, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +10 for amount > 20 (boundary 21)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: 21, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(40); // 30 + 10
  });

  it('adds +10 for amount = 50 (boundary: not > 50)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: 50, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(40); // 30 + 10
  });

  it('adds +5 for amount 1-20 (truthy but not > 20)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: 15, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(35); // 30 + 5
  });

  it('adds +5 for amount = 20 (boundary: not > 20)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: 20, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(35); // 30 + 5
  });

  it('adds +0 for amount = 0 (falsy → if block skipped)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: 0, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30);
  });

  it('adds +0 for amount = undefined', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: undefined, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30);
  });

  it('treats negative amount as truthy → +5 (documented behavior)', () => {
    // Note: receipt-parser regex only matches positive \d+, so negative amounts
    // shouldn't occur in practice. This test documents the fallback behavior.
    const score = calculateEmailImpulseScore(
      makeParsed({ amount: -50, confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(35); // 30 + 5 (negative is truthy, falls to else branch)
  });
});

// ============================================================
// calculateEmailImpulseScore — Hour / timing tiers (UTC timezone)
// ============================================================

describe('calculateEmailImpulseScore — hour tiers (UTC)', () => {
  it('adds +15 for late night hour 22', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(22),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +15 for late night hour 23', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(23),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +15 for late night hour 0 (midnight)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(0),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +15 for late night hour 1', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(1),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +15 for late night hour 2 (boundary: < 3)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(2),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +0 for hour 3 (boundary: not < 3, not >= 20)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(3),
      'UTC',
    );
    expect(score).toBe(30); // daytime, no bonus
  });

  it('adds +0 for daytime hour 12', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30);
  });

  it('adds +0 for hour 19 (boundary: not >= 20)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(19),
      'UTC',
    );
    expect(score).toBe(30);
  });

  it('adds +8 for evening hour 20 (boundary: >= 20 but < 22)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(20),
      'UTC',
    );
    expect(score).toBe(38); // 30 + 8
  });

  it('adds +8 for evening hour 21', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      dateAtUtcHour(21),
      'UTC',
    );
    expect(score).toBe(38); // 30 + 8
  });
});

// ============================================================
// calculateEmailImpulseScore — Impulse platform bonus
// ============================================================

describe('calculateEmailImpulseScore — impulse platform bonus', () => {
  it('adds +15 for tiktok_shop platform', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ platform: 'tiktok_shop', confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +15 for temu platform', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ platform: 'temu', confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +15 for shein platform', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ platform: 'shein', confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('adds +0 for amazon platform (not in impulse list)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ platform: 'amazon', confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30);
  });

  it('adds +0 for unknown platform', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ platform: 'unknown', confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30);
  });

  it('adds +0 for ebay platform (not in impulse list)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ platform: 'ebay', confidence: 0.95 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30);
  });
});

// ============================================================
// calculateEmailImpulseScore — Confidence penalty
// ============================================================

describe('calculateEmailImpulseScore — confidence penalty', () => {
  it('does NOT apply penalty for confidence = 0.5 (boundary: not < 0.5)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.5 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30); // no penalty
  });

  it('applies -10 penalty for confidence = 0.49 (boundary: < 0.5)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.49 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(20); // 30 - 10
  });

  it('applies -10 penalty for confidence = 0', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(20); // 30 - 10
  });

  it('does NOT apply penalty for confidence = 1.0', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 1.0 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30);
  });

  it('does NOT apply penalty for confidence > 1.0 (defensive)', () => {
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 2.0 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(30);
  });
});

// ============================================================
// calculateEmailImpulseScore — Combined scenarios
// ============================================================

describe('calculateEmailImpulseScore — combined scenarios', () => {
  it('high amount + late night + impulse platform + high confidence = 85', () => {
    // 30 + 25 (amount>100) + 15 (late night) + 15 (impulse) = 85
    const score = calculateEmailImpulseScore(
      makeParsed({ platform: 'tiktok_shop', amount: 200, confidence: 0.95 }),
      dateAtUtcHour(23),
      'UTC',
    );
    expect(score).toBe(85);
  });

  it('high amount + late night + impulse platform + low confidence = 75', () => {
    // 30 + 25 + 15 + 15 - 10 = 75
    const score = calculateEmailImpulseScore(
      makeParsed({ platform: 'temu', amount: 150, confidence: 0.3 }),
      dateAtUtcHour(2),
      'UTC',
    );
    expect(score).toBe(75);
  });

  it('no amount + daytime + unknown platform + low confidence = 20', () => {
    // 30 + 0 + 0 + 0 - 10 = 20
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.1 }),
      dateAtUtcHour(12),
      'UTC',
    );
    expect(score).toBe(20);
  });

  it('small amount + evening + non-impulse platform + high confidence = 43', () => {
    // 30 + 5 (amount 1-20) + 8 (evening) + 0 = 43
    const score = calculateEmailImpulseScore(
      makeParsed({ platform: 'amazon', amount: 10, confidence: 0.95 }),
      dateAtUtcHour(20),
      'UTC',
    );
    expect(score).toBe(43);
  });
});

// ============================================================
// calculateEmailImpulseScore — Timezone handling
// ============================================================

describe('calculateEmailImpulseScore — timezone handling', () => {
  it('uses provided timezone (UTC) correctly', () => {
    // 22:00 UTC with UTC timezone → hour 22 → late night
    const date = new Date('2024-06-15T22:00:00Z');
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      date,
      'UTC',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('uses Asia/Shanghai timezone (UTC+8) — 14:00 UTC = 22:00 Shanghai → late night', () => {
    // 14:00 UTC = 22:00 Asia/Shanghai → late night +15
    const date = new Date('2024-06-15T14:00:00Z');
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      date,
      'Asia/Shanghai',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('uses America/Los_Angeles timezone (UTC-7 summer) — 05:00 UTC = 22:00 PDT → late night', () => {
    // June 15: PDT = UTC-7. 05:00 UTC = 22:00 PDT (previous day) → late night
    const date = new Date('2024-06-15T05:00:00Z');
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      date,
      'America/Los_Angeles',
    );
    expect(score).toBe(45); // 30 + 15
  });

  it('falls back to getHours() for invalid timezone (does not throw)', () => {
    // Invalid timezone → catch block → getHours() (server local)
    // We can't assert exact hour (depends on runner's TZ), but it should not throw
    const date = new Date('2024-06-15T22:00:00Z');
    expect(() => {
      calculateEmailImpulseScore(
        makeParsed({ confidence: 0.95 }),
        date,
        'Invalid/Timezone',
      );
    }).not.toThrow();
  });

  it('works without timezone (falls back to getHours)', () => {
    // No timezone → server local hour. Should not throw, returns a number in [0, 100].
    const date = new Date('2024-06-15T22:00:00Z');
    const score = calculateEmailImpulseScore(
      makeParsed({ confidence: 0.95 }),
      date,
    );
    expect(score).toBeGreaterThanOrEqual(20);
    expect(score).toBeLessThanOrEqual(85);
  });

  it('empty string timezone is falsy → falls back to getHours', () => {
    const date = new Date('2024-06-15T22:00:00Z');
    expect(() => {
      calculateEmailImpulseScore(
        makeParsed({ confidence: 0.95 }),
        date,
        '',
      );
    }).not.toThrow();
  });
});

// ============================================================
// calculateEmailImpulseScore — Score clamping / range
// ============================================================

describe('calculateEmailImpulseScore — score range', () => {
  it('score is always within [0, 100]', () => {
    // Test various combinations — all should be in [0, 100]
    const testCases = [
      { amount: 1000, confidence: 0.0, hour: 23, platform: 'tiktok_shop' },
      { amount: 1, confidence: 1.0, hour: 12, platform: 'unknown' },
      { amount: undefined, confidence: 0.1, hour: 2, platform: 'temu' },
      { amount: 50, confidence: 0.5, hour: 20, platform: 'amazon' },
    ];
    for (const tc of testCases) {
      const score = calculateEmailImpulseScore(
        makeParsed({ platform: tc.platform, amount: tc.amount, confidence: tc.confidence }),
        dateAtUtcHour(tc.hour),
        'UTC',
      );
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================
// extractPlainText
// ============================================================

describe('extractPlainText', () => {
  it('returns plain text trimmed (no HTML tags)', () => {
    expect(extractPlainText('  Hello World  ')).toBe('Hello World');
  });

  it('returns plain text with special chars (no HTML)', () => {
    expect(extractPlainText('Price: $49.99 — Order #12345')).toBe('Price: $49.99 — Order #12345');
  });

  it('does NOT treat "if x < 5 then y > 3" as HTML (Round 22 fix)', () => {
    // Old regex /<[^>]+>/ would match "< 5 then y >" and strip it.
    // Fixed regex /<[a-zA-Z][^>]*>/ only matches tags starting with a letter.
    const text = 'if x < 5 then y > 3';
    expect(extractPlainText(text)).toBe('if x < 5 then y > 3');
  });

  it('converts simple HTML to text', () => {
    const html = '<p>Hello <strong>World</strong></p>';
    const result = extractPlainText(html);
    expect(result).toContain('Hello');
    expect(result).toContain('World');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('converts HTML with links (link href hidden when same as text)', () => {
    const html = '<a href="https://example.com">example.com</a>';
    const result = extractPlainText(html);
    expect(result).toContain('example.com');
  });

  it('skips img tags in HTML conversion', () => {
    const html = '<p>Before</p><img src="x.png" alt="pic" /><p>After</p>';
    const result = extractPlainText(html);
    expect(result).toContain('Before');
    expect(result).toContain('After');
    // img tag itself should be stripped
    expect(result).not.toContain('<img');
  });

  it('handles empty string', () => {
    expect(extractPlainText('')).toBe('');
  });

  it('handles HTML with entities', () => {
    const html = '<p>Cost: &amp; profit</p>';
    const result = extractPlainText(html);
    expect(result).toContain('Cost');
    expect(result).toContain('profit');
    expect(result).toContain('&');
  });

  it('does not throw on malformed HTML', () => {
    // Malformed HTML that might trigger the catch path — verify no throw
    const weird = '<div>text</div><<<not a tag>>>';
    expect(() => extractPlainText(weird)).not.toThrow();
  });

  it('returns text content from nested HTML tables', () => {
    const html = '<table><tr><td>Order</td><td>Total</td></tr><tr><td>#123</td><td>$45</td></tr></table>';
    const result = extractPlainText(html);
    expect(result).toContain('Order');
    expect(result).toContain('Total');
    expect(result).toContain('#123');
    expect(result).toContain('$45');
  });

  it('handles whitespace-only string', () => {
    expect(extractPlainText('   \n\t  ')).toBe('');
  });
});
