/**
 * Tests for ai-audit.ts — pure helper functions
 *
 * 🔧 ARCH fix (Round 74 ARCH-DEEP-74):
 *   旧: 0 tests for ai-audit.ts (constitution violation 检测 + risk level 推断 + PII redaction 无覆盖)
 *   修复: +N tests covering detectConstitutionViolation (8 patterns) +
 *         inferRiskLevel (action → risk) + redactBasicPII (SSN + credit card)
 *
 * Tests ONLY pure functions — logAIBehavior / logAIBehaviorBatch require
 * Supabase admin client mock, 跳过 per task rules.
 */

import { describe, it, expect } from 'vitest';
import {
  detectConstitutionViolation,
  inferRiskLevel,
  redactBasicPII,
} from '@/lib/ai-audit';

// ============================================================
// detectConstitutionViolation — pattern matching
// ============================================================

describe('detectConstitutionViolation', () => {
  // --- English patterns ---

  it('detects "you should buy"', () => {
    expect(detectConstitutionViolation('you should buy this product')).toBe(true);
    expect(detectConstitutionViolation('You should buy this product')).toBe(true); // case insensitive
    expect(detectConstitutionViolation('YOU SHOULD BUY THIS')).toBe(true);
  });

  it('detects "you should get"', () => {
    expect(detectConstitutionViolation('you should get this now')).toBe(true);
  });

  it('detects "you should check out"', () => {
    expect(detectConstitutionViolation('you should check out this deal')).toBe(true);
  });

  it('detects "I recommend you buy"', () => {
    expect(detectConstitutionViolation('I recommend you buy this item')).toBe(true);
    expect(detectConstitutionViolation('i recommend buy this')).toBe(true); // "you" is optional
  });

  it('detects "I suggest you purchase"', () => {
    expect(detectConstitutionViolation('I suggest you purchase this')).toBe(true);
    expect(detectConstitutionViolation('i suggest get this')).toBe(true);
  });

  it('detects "this sale on X is great/amazing/worth it"', () => {
    expect(detectConstitutionViolation('this sale on shoes is great')).toBe(true);
    expect(detectConstitutionViolation('this sale on shoes is amazing')).toBe(true);
    expect(detectConstitutionViolation('this sale on shoes is worth it')).toBe(true);
  });

  it('detects "only N left in stock"', () => {
    expect(detectConstitutionViolation('only 5 left in stock')).toBe(true);
    expect(detectConstitutionViolation('Only 100 left in stock')).toBe(true);
    expect(detectConstitutionViolation('only 0 left in stock')).toBe(true);
  });

  it('detects "sale ends today/tonight/in N hours"', () => {
    expect(detectConstitutionViolation('sale ends today')).toBe(true);
    expect(detectConstitutionViolation('sale ends tonight')).toBe(true);
    expect(detectConstitutionViolation('sale ends in 24 hours')).toBe(true);
    expect(detectConstitutionViolation('Sale ends in 3 hours')).toBe(true);
  });

  // --- Chinese patterns ---

  it('detects 推荐你买', () => {
    expect(detectConstitutionViolation('推荐你买这个')).toBe(true);
  });

  it('detects 建议你买/购/入手', () => {
    expect(detectConstitutionViolation('建议你买这个')).toBe(true);
    expect(detectConstitutionViolation('建议你购这个')).toBe(true);
    expect(detectConstitutionViolation('建议你入手这个')).toBe(true);
  });

  it('detects 限时优惠/折扣', () => {
    expect(detectConstitutionViolation('限时优惠')).toBe(true);
    expect(detectConstitutionViolation('限时折扣')).toBe(true);
    expect(detectConstitutionViolation('限时优惠仅此一天')).toBe(true);
  });

  // --- negative cases ---

  it('returns false for empty string', () => {
    expect(detectConstitutionViolation('')).toBe(false);
  });

  it('returns false for benign text', () => {
    expect(detectConstitutionViolation('hello world')).toBe(false);
    expect(detectConstitutionViolation('how are you doing today?')).toBe(false);
    expect(detectConstitutionViolation('let me help you save money')).toBe(false);
  });

  it('returns false for text that mentions buying but not as recommendation', () => {
    expect(detectConstitutionViolation('I bought this yesterday')).toBe(false);
    expect(detectConstitutionViolation('you bought too much')).toBe(false);
    expect(detectConstitutionViolation('buying less is better')).toBe(false);
  });

  it('returns false for "you should" without buy/get/check out', () => {
    expect(detectConstitutionViolation('you should save money')).toBe(false);
    expect(detectConstitutionViolation('you should think twice')).toBe(false);
  });

  it('returns false for "sale on X" without great/amazing/worth it', () => {
    expect(detectConstitutionViolation('this sale on shoes is expensive')).toBe(false);
    expect(detectConstitutionViolation('this sale on shoes ends soon')).toBe(false); // "ends soon" not "ends today/tonight/in N hours"
  });

  it('returns false for "left in stock" without "only N"', () => {
    expect(detectConstitutionViolation('5 left in stock')).toBe(false); // missing "only"
    expect(detectConstitutionViolation('items left in stock')).toBe(false);
  });

  it('returns false for Chinese text without violation patterns', () => {
    expect(detectConstitutionViolation('你好世界')).toBe(false);
    expect(detectConstitutionViolation('建议你存钱')).toBe(false); // 建议你存 not 建议你买
  });

  // --- partial / embedded matches ---

  it('detects pattern embedded in longer text', () => {
    expect(detectConstitutionViolation('Hey, you should buy this amazing product!')).toBe(true);
    expect(detectConstitutionViolation('快速！限时优惠仅此一天！')).toBe(true);
  });

  it('detects multiple patterns in one text (returns true on first match)', () => {
    const text = 'you should buy this. Also sale ends today. Also 限时优惠';
    expect(detectConstitutionViolation(text)).toBe(true);
  });
});

// ============================================================
// inferRiskLevel — action → risk mapping
// ============================================================

describe('inferRiskLevel', () => {
  it('returns high for consume_recommend', () => {
    expect(inferRiskLevel('consume_recommend')).toBe('high');
  });

  it('returns high for constitution_violation', () => {
    expect(inferRiskLevel('constitution_violation')).toBe('high');
  });

  it('returns medium for challenge_judge', () => {
    expect(inferRiskLevel('challenge_judge')).toBe('medium');
  });

  it('returns low for tool_call', () => {
    expect(inferRiskLevel('tool_call')).toBe('low');
  });

  it('returns low for consume_intercept (default branch)', () => {
    expect(inferRiskLevel('consume_intercept')).toBe('low');
  });

  it('all 5 actions have explicit mapping (no unexpected defaults)', () => {
    const actions = [
      'consume_recommend',
      'consume_intercept',
      'tool_call',
      'challenge_judge',
      'constitution_violation',
    ] as const;
    const riskLevels = new Set(actions.map(a => inferRiskLevel(a)));
    expect(riskLevels.has('high')).toBe(true);
    expect(riskLevels.has('medium')).toBe(true);
    expect(riskLevels.has('low')).toBe(true);
  });
});

// ============================================================
// redactBasicPII — SSN + credit card masking
// ============================================================

describe('redactBasicPII', () => {
  // --- SSN ---

  it('redacts SSN in XXX-XX-XXXX format', () => {
    expect(redactBasicPII('My SSN is 123-45-6789')).toBe('My SSN is [SSN REDACTED]');
    expect(redactBasicPII('SSN: 987-65-4321')).toBe('SSN: [SSN REDACTED]');
  });

  it('redacts multiple SSNs in one text', () => {
    expect(redactBasicPII('SSN1: 123-45-6789, SSN2: 987-65-4321')).toBe(
      'SSN1: [SSN REDACTED], SSN2: [SSN REDACTED]'
    );
  });

  it('does NOT redact phone numbers (XXX-XXX-XXXX format, 3-3-4 not 3-2-4)', () => {
    expect(redactBasicPII('Call me at 123-456-7890')).toBe('Call me at 123-456-7890');
    expect(redactBasicPII('Phone: 555-123-4567')).toBe('Phone: 555-123-4567');
  });

  // --- Credit card: 16 digits with separators ---

  it('redacts 16-digit credit card with no separators', () => {
    expect(redactBasicPII('Card: 4111111111111111')).toBe('Card: [CARD REDACTED]');
    expect(redactBasicPII('Card: 5500000000000004')).toBe('Card: [CARD REDACTED]');
  });

  it('redacts 16-digit credit card with dashes', () => {
    expect(redactBasicPII('Card: 4111-1111-1111-1111')).toBe('Card: [CARD REDACTED]');
  });

  it('redacts 16-digit credit card with spaces', () => {
    expect(redactBasicPII('Card: 4111 1111 1111 1111')).toBe('Card: [CARD REDACTED]');
  });

  it('redacts 16-digit credit card with mixed separators', () => {
    expect(redactBasicPII('Card: 4111-1111 1111-1111')).toBe('Card: [CARD REDACTED]');
  });

  // --- Credit card: 13-16 contiguous digits ---

  it('redacts 13-digit card (Visa legacy)', () => {
    expect(redactBasicPII('Card: 4222222222222')).toBe('Card: [CARD REDACTED]');
  });

  it('redacts 15-digit card (Amex)', () => {
    expect(redactBasicPII('Card: 378282246310005')).toBe('Card: [CARD REDACTED]');
  });

  it('redacts 14-digit card (Diners Club)', () => {
    expect(redactBasicPII('Card: 36438901234567')).toBe('Card: [CARD REDACTED]');
  });

  it('does NOT redact 12-digit numbers (not a credit card)', () => {
    expect(redactBasicPII('Order 123456789012')).toBe('Order 123456789012');
  });

  it('does NOT redact 17+ digit numbers (not a credit card)', () => {
    expect(redactBasicPII('Tracking 12345678901234567')).toBe('Tracking 12345678901234567');
  });

  // --- false positive checks ---

  it('does NOT redact regular prices/amounts', () => {
    expect(redactBasicPII('Price: $99.99')).toBe('Price: $99.99');
    expect(redactBasicPII('Total: $1,234.56')).toBe('Total: $1,234.56');
  });

  it('does NOT redact order numbers with dashes (wrong digit groupings)', () => {
    // Order #1234-5678 (8 digits, 4-4 format, not 4-4-4-4)
    expect(redactBasicPII('Order #1234-5678')).toBe('Order #1234-5678');
  });

  it('does NOT redact dates (YYYY-MM-DD)', () => {
    expect(redactBasicPII('Date: 2026-01-15')).toBe('Date: 2026-01-15');
    expect(redactBasicPII('Date: 2026-12-25')).toBe('Date: 2026-12-25');
  });

  // --- combined PII ---

  it('redacts SSN and credit card in same text', () => {
    const input = 'SSN 123-45-6789 and card 4111111111111111';
    const result = redactBasicPII(input);
    expect(result).toBe('SSN [SSN REDACTED] and card [CARD REDACTED]');
    expect(result).not.toContain('123-45-6789');
    expect(result).not.toContain('4111111111111111');
  });

  it('redacts multiple credit cards in same text', () => {
    const input = 'Card1: 4111111111111111, Card2: 5500000000000004';
    const result = redactBasicPII(input);
    expect(result).toBe('Card1: [CARD REDACTED], Card2: [CARD REDACTED]');
  });

  // --- null/undefined/empty ---

  it('returns undefined for null input', () => {
    expect(redactBasicPII(null)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(redactBasicPII(undefined)).toBeUndefined();
  });

  it('returns empty string for empty input', () => {
    expect(redactBasicPII('')).toBe('');
  });

  // --- no false redaction on benign text ---

  it('does NOT modify text without PII', () => {
    const benign = 'Hello, how are you today? Let me help you save money.';
    expect(redactBasicPII(benign)).toBe(benign);
  });

  it('preserves text structure (only PII replaced)', () => {
    const input = 'User said: my card 4111111111111111 expired yesterday';
    const result = redactBasicPII(input);
    expect(result).toBe('User said: my card [CARD REDACTED] expired yesterday');
    // Surrounding text preserved
    expect(result).toContain('User said: my card');
    expect(result).toContain('expired yesterday');
  });

  // --- boundary: card at start/end of string ---

  it('redacts credit card at start of string', () => {
    expect(redactBasicPII('4111111111111111 is my card')).toBe('[CARD REDACTED] is my card');
  });

  it('redacts credit card at end of string', () => {
    expect(redactBasicPII('my card is 4111111111111111')).toBe('my card is [CARD REDACTED]');
  });

  it('redacts SSN at start of string', () => {
    expect(redactBasicPII('123-45-6789 is my SSN')).toBe('[SSN REDACTED] is my SSN');
  });

  // --- word boundary edge cases ---

  it('does NOT redact 16 digits surrounded by letters (no word boundary)', () => {
    // "4111111111111111a" — letter after digits, no \b between digit and letter (both word chars)
    // \b\d{13,16}\b requires word boundary at end; digit→letter is NOT a boundary
    expect(redactBasicPII('card4111111111111111a expired')).toBe('card4111111111111111a expired');
  });

  it('redacts 16 digits followed by punctuation (word boundary exists)', () => {
    // "4111111111111111." — digit→punctuation IS a word boundary
    expect(redactBasicPII('card 4111111111111111.')).toBe('card [CARD REDACTED].');
    expect(redactBasicPII('card 4111111111111111!')).toBe('card [CARD REDACTED]!');
  });
});
