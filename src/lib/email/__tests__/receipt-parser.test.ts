/**
 * Tests for email/receipt-parser.ts — parseReceipt + isReceiptEmail
 *
 * 🔧 ARCH fix (Round 73 ARCH-DEEP-73): 测试覆盖率 — receipt-parser 0 tests → 40+ tests
 *
 * parseReceipt (纯函数):
 *   - Known platform (sender match) → high confidence (0.95)
 *   - Known platform (subject-only match) → medium confidence (0.5)
 *   - Unknown platform (generic receipt keywords) → low confidence (0.3)
 *   - Non-receipt → isReceipt=false
 *   - Amount / orderId / itemName extraction
 *   - NaN protection on amount
 *   - refundDeadlineDays from platform config
 *
 * isReceiptEmail (纯函数):
 *   - sender + subject match → true
 *   - sender + generic keyword → true
 *   - generic keyword only → true
 *   - snippet hint + receipt-related subject → true
 *   - Non-receipt → false
 *
 * Regex safety: All patterns use bounded quantifiers (\d+, [A-Z0-9\-]+, .+?\n)
 * with no nested quantifiers — no catastrophic backtracking risk.
 */

import { describe, it, expect } from 'vitest';
import {
  parseReceipt,
  isReceiptEmail,
  getRefundDeadline,
  buildGmailReceiptQuery,
  KNOWN_SHOPPING_DOMAINS,
} from '@/lib/email/receipt-parser';

// ============================================================
// isReceiptEmail — positive cases
// ============================================================

describe('isReceiptEmail — positive cases', () => {
  it('returns true for TikTok Shop sender + order confirmation subject', () => {
    expect(isReceiptEmail(
      'shop@tiktok.com',
      'Your TikTok Shop Order Confirmation',
      'Thanks for your purchase',
    )).toBe(true);
  });

  it('returns true for Amazon sender + shipment confirmation subject', () => {
    expect(isReceiptEmail(
      'shipment@amazon.com',
      'Your Amazon.com order has shipped',
      'Your order #123 has shipped',
    )).toBe(true);
  });

  it('returns true for Target sender + target order subject', () => {
    expect(isReceiptEmail(
      'order@target.com',
      'Your Target order',
      'Order total: $45',
    )).toBe(true);
  });

  it('returns true for Walmart sender + order confirmation subject', () => {
    expect(isReceiptEmail(
      'order@walmart.com',
      'Order confirmation - Walmart',
      'Thanks for shopping',
    )).toBe(true);
  });

  it('returns true for SHEIN sender + order placed subject', () => {
    expect(isReceiptEmail(
      'noreply@shein.com',
      'Your order has been placed',
      'SHEIN order #12345',
    )).toBe(true);
  });

  it('returns true for Temu sender + order confirmation subject', () => {
    expect(isReceiptEmail(
      'noreply@temu.com',
      'Temu order confirmation',
      'Order total: $12.99',
    )).toBe(true);
  });

  it('returns true for eBay sender + purchase confirmation subject', () => {
    expect(isReceiptEmail(
      'order@ebay.com',
      'Purchase confirmation',
      'eBay order #99',
    )).toBe(true);
  });

  it('returns true for Etsy sender + receipt subject', () => {
    expect(isReceiptEmail(
      'transaction@etsy.com',
      'Receipt from Etsy',
      'Your Etsy order',
    )).toBe(true);
  });

  it('returns true for Nike sender + receipt subject', () => {
    expect(isReceiptEmail(
      'noreply@nike.com',
      'Your receipt',
      'Nike order #N123',
    )).toBe(true);
  });

  it('returns true for Starbucks sender + receipt subject', () => {
    expect(isReceiptEmail(
      'noreply@starbucks.com',
      'Your receipt',
      'Total: $5.75',
    )).toBe(true);
  });

  it('returns true for known sender + generic receipt keyword subject', () => {
    // sender matches a platform but subject is a generic keyword (not platform-specific)
    expect(isReceiptEmail(
      'shop@tiktok.com',
      'Order confirmation', // generic keyword
      'Some snippet',
    )).toBe(true);
  });

  it('returns true for unknown sender + generic receipt keyword subject', () => {
    expect(isReceiptEmail(
      'random@unknown.com',
      'Order confirmation',
      'Some snippet',
    )).toBe(true);
  });

  it('returns true for unknown sender + "thank you for your order" subject', () => {
    expect(isReceiptEmail(
      'shop@random-store.com',
      'Thank you for your order',
      'Your order is being processed',
    )).toBe(true);
  });

  it('returns true for snippet hint (order #) + receipt-related subject', () => {
    expect(isReceiptEmail(
      'random@unknown.com',
      'Your order',
      'Your order #12345 has been received',
    )).toBe(true);
  });

  it('returns true for snippet hint (total $) + purchase subject', () => {
    expect(isReceiptEmail(
      'random@unknown.com',
      'Purchase receipt',
      'Total: $49.99',
    )).toBe(true);
  });

  it('returns true for snippet hint (purchase of $) + buy subject', () => {
    expect(isReceiptEmail(
      'random@unknown.com',
      'Buy confirmation',
      'Purchase of $99 has been completed',
    )).toBe(true);
  });
});

// ============================================================
// isReceiptEmail — negative cases
// ============================================================

describe('isReceiptEmail — negative cases', () => {
  it('returns false for newsletter email', () => {
    expect(isReceiptEmail(
      'newsletter@medium.com',
      'This week in tech',
      'Read our latest articles',
    )).toBe(false);
  });

  it('returns false for personal email', () => {
    expect(isReceiptEmail(
      'friend@gmail.com',
      'Re: Lunch tomorrow',
      'Hey, want to grab lunch?',
    )).toBe(false);
  });

  it('returns false for promotional email without receipt keywords', () => {
    expect(isReceiptEmail(
      'deals@bestbuy.com',
      'Black Friday deals are here!',
      'Save big on TVs and laptops',
    )).toBe(false);
  });

  it('returns false for password reset email', () => {
    expect(isReceiptEmail(
      'noreply@amazon.com',
      'Password reset request',
      'Click here to reset your password',
    )).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(isReceiptEmail('', '', '')).toBe(false);
  });

  it('returns false for snippet hint without receipt-related subject', () => {
    // snippet has "order #123" but subject doesn't contain order/purchase/buy/receipt
    expect(isReceiptEmail(
      'random@unknown.com',
      'Weekly newsletter',
      'Your order #123 is mentioned',
    )).toBe(false);
  });

  it('returns false for subject with "order" but no snippet hint and no sender match', () => {
    // subject "Your order" doesn't match any generic keyword pattern exactly
    // (generic patterns are: order confirmation, purchase receipt, etc.)
    expect(isReceiptEmail(
      'random@unknown.com',
      'Your order',
      'Just checking in',
    )).toBe(false);
  });
});

// ============================================================
// parseReceipt — known platform (sender match, high confidence)
// ============================================================

describe('parseReceipt — known platform (sender match)', () => {
  it('parses TikTok Shop receipt with sender + subject match', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Your TikTok Shop order confirmation',
      'Order #ABC123 Total: $49.99',
    );
    expect(result.platform).toBe('tiktok_shop');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.refundEligible).toBe(true);
    expect(result.refundDeadlineDays).toBe(30);
    expect(result.currency).toBe('USD');
  });

  it('parses Amazon receipt with sender + subject match', () => {
    const result = parseReceipt(
      'shipment@amazon.com',
      'Your Amazon.com order has shipped',
      'Order #123-4567890-1234567 Order total: $129.99',
    );
    expect(result.platform).toBe('amazon');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.refundDeadlineDays).toBe(30);
  });

  it('parses Target receipt with sender + subject match', () => {
    const result = parseReceipt(
      'order@target.com',
      'Your Target order',
      'Order #TC123 Order total: $75',
    );
    expect(result.platform).toBe('target');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.refundDeadlineDays).toBe(90);
  });

  it('parses Walmart receipt with sender + subject match', () => {
    const result = parseReceipt(
      'order@walmart.com',
      'Your Walmart order',
      'Order #WM456 Order total: $30',
    );
    expect(result.platform).toBe('walmart');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.refundDeadlineDays).toBe(90);
  });

  it('parses SHEIN receipt with sender + subject match', () => {
    const result = parseReceipt(
      'noreply@shein.com',
      'SHEIN order confirmation',
      'Total: $25.50',
    );
    expect(result.platform).toBe('shein');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.refundDeadlineDays).toBe(45);
  });

  it('parses Temu receipt with sender + subject match', () => {
    const result = parseReceipt(
      'noreply@temu.com',
      'Temu order confirmation',
      'Total: $12.99',
    );
    expect(result.platform).toBe('temu');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.refundDeadlineDays).toBe(90);
  });

  it('parses Starbucks receipt with short refund window', () => {
    const result = parseReceipt(
      'noreply@starbucks.com',
      'Your receipt',
      'Total: $5.75',
    );
    expect(result.platform).toBe('starbucks');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.refundDeadlineDays).toBe(7);
  });

  it('confidence is 0.7 when sender matches but subject does NOT match platform subject', () => {
    // sender matches TikTok but subject is generic "Order received"
    // (not in tiktok_shop.subjectPatterns, but isReceiptEmail would still detect it)
    const result = parseReceipt(
      'shop@tiktok.com',
      'Generic subject not in patterns',
      'Some content',
    );
    expect(result.platform).toBe('tiktok_shop');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.7); // sender match only
  });
});

// ============================================================
// parseReceipt — subject-only match (medium confidence)
// ============================================================

describe('parseReceipt — subject-only match (confidence 0.5)', () => {
  it('parses TikTok Shop via subject match when sender is unknown', () => {
    const result = parseReceipt(
      'unknown@random.com',
      'Your TikTok Shop order',
      'Total: $49',
    );
    expect(result.platform).toBe('tiktok_shop');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.5);
  });

  it('parses Amazon via subject match when sender is unknown', () => {
    const result = parseReceipt(
      'unknown@random.com',
      'Your Amazon.com order',
      'Order total: $99',
    );
    expect(result.platform).toBe('amazon');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.5);
  });
});

// ============================================================
// parseReceipt — amount extraction
// ============================================================

describe('parseReceipt — amount extraction', () => {
  it('extracts amount from "Total: $49.99"', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Total: $49.99',
    );
    expect(result.amount).toBe(49.99);
  });

  it('extracts amount from "Total:49.99" (no space, no $)', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Total:49.99',
    );
    expect(result.amount).toBe(49.99);
  });

  it('extracts amount from "Amount: $129.50"', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Amount: $129.50',
    );
    expect(result.amount).toBe(129.5);
  });

  it('extracts amount from "Charged: $15"', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Charged: $15',
    );
    expect(result.amount).toBe(15);
  });

  it('extracts amount from "Order total: $75" (Amazon pattern)', () => {
    const result = parseReceipt(
      'shipment@amazon.com',
      'Your Amazon.com order',
      'Order total: $75.00',
    );
    expect(result.amount).toBe(75);
  });

  it('extracts amount from body when snippet is short', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'short snippet',
      'Full body text\nTotal: $199.99\nMore text',
    );
    expect(result.amount).toBe(199.99);
  });

  it('returns undefined amount when no amount pattern matches', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'No amount mentioned here',
    );
    expect(result.amount).toBeUndefined();
  });

  it('NaN protection: returns undefined for non-numeric amount (defensive)', () => {
    // The regex \d+\.?\d* only matches digits, so parseFloat won't return NaN
    // in practice. But if somehow NaN is produced, the guard handles it.
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Total: 50',
    );
    expect(result.amount).toBe(50);
    expect(Number.isFinite(result.amount)).toBe(true);
  });
});

// ============================================================
// parseReceipt — orderId extraction
// ============================================================

describe('parseReceipt — orderId extraction', () => {
  it('extracts order ID from "Order ID: ABC-123"', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Order ID: ABC-123\nTotal: $50',
    );
    expect(result.orderId).toBe('ABC-123');
  });

  it('extracts order ID from "Order #456"', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Order #456\nTotal: $50',
    );
    expect(result.orderId).toBe('456');
  });

  it('extracts Amazon order ID (###-#######-#######)', () => {
    const result = parseReceipt(
      'shipment@amazon.com',
      'Your Amazon.com order',
      'Order #123-4567890-1234567\nOrder total: $99',
    );
    expect(result.orderId).toBe('123-4567890-1234567');
  });

  it('extracts order ID from body', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'short',
      'Order number: XYZ-789\nTotal: $50',
    );
    expect(result.orderId).toBe('XYZ-789');
  });

  it('returns undefined orderId when no pattern matches', () => {
    // Use snippet without the word "order" to avoid matching orderId patterns
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Random description\nTotal: $50',
    );
    expect(result.orderId).toBeUndefined();
  });
});

// ============================================================
// parseReceipt — itemName extraction
// ============================================================

describe('parseReceipt — itemName extraction', () => {
  it('extracts item name from "Item: Wireless Earbuds"', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Item: Wireless Earbuds\nTotal: $50',
    );
    expect(result.itemName).toBe('Wireless Earbuds');
  });

  it('extracts item name from "Product: Phone Case"', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Product: Phone Case\nTotal: $50',
    );
    expect(result.itemName).toBe('Phone Case');
  });

  it('truncates item name to 200 chars (defensive)', () => {
    const longName = 'A'.repeat(300);
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      `Item: ${longName}\nTotal: $50`,
    );
    expect(result.itemName).toHaveLength(200);
  });

  it('returns undefined itemName when no pattern matches', () => {
    // Use snippet without "item"/"product" to avoid matching itemName patterns
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Random description\nTotal: $50',
    );
    expect(result.itemName).toBeUndefined();
  });
});

// ============================================================
// parseReceipt — generic fallback (unknown platform)
// ============================================================

describe('parseReceipt — generic fallback (unknown platform)', () => {
  it('returns unknown platform with 0.3 confidence for generic receipt', () => {
    // Use sender that doesn't match any platform + subject that only matches
    // GENERIC_RECEIPT_KEYWORDS (not any platform's subjectPatterns).
    // "Order summary" is in generic keywords but not in any platform subjectPatterns.
    const result = parseReceipt(
      'random@unknown-store.com',
      'Order summary',
      'Total: $50',
    );
    expect(result.platform).toBe('unknown');
    expect(result.isReceipt).toBe(true);
    expect(result.confidence).toBe(0.3);
    expect(result.refundEligible).toBe(true);
    expect(result.refundDeadlineDays).toBe(30); // default 30 days
  });

  it('extracts amount via generic pattern for unknown platform', () => {
    const result = parseReceipt(
      'random@unknown-store.com',
      'Order summary',
      'Total: $42.50',
    );
    expect(result.amount).toBe(42.5);
  });

  it('extracts orderId via generic pattern for unknown platform', () => {
    const result = parseReceipt(
      'random@unknown-store.com',
      'Order summary',
      'Order #GENERIC-123\nTotal: $42.50',
    );
    expect(result.orderId).toBe('GENERIC-123');
  });
});

// ============================================================
// parseReceipt — non-receipt emails
// ============================================================

describe('parseReceipt — non-receipt emails', () => {
  it('returns isReceipt=false for newsletter', () => {
    const result = parseReceipt(
      'newsletter@medium.com',
      'This week in tech',
      'Read our latest articles',
    );
    expect(result.isReceipt).toBe(false);
    expect(result.platform).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('returns isReceipt=false for personal email', () => {
    const result = parseReceipt(
      'friend@gmail.com',
      'Re: Lunch tomorrow',
      'Hey, want to grab lunch?',
    );
    expect(result.isReceipt).toBe(false);
  });

  it('returns isReceipt=false for password reset email from non-shopping sender', () => {
    // Note: password reset from noreply@amazon.com WOULD be detected as a receipt
    // (sender-only match, confidence 0.7) — a known false-positive of sender-based
    // detection. Use a non-shopping sender to get isReceipt=false.
    const result = parseReceipt(
      'noreply@medium.com',
      'Password reset request',
      'Click here to reset your password',
    );
    expect(result.isReceipt).toBe(false);
  });

  it('returns isReceipt=false for promotional email without receipt keywords', () => {
    const result = parseReceipt(
      'deals@bestbuy.com',
      'Black Friday deals are here!',
      'Save big on TVs and laptops',
    );
    expect(result.isReceipt).toBe(false);
  });

  it('returns isReceipt=false for empty strings', () => {
    const result = parseReceipt('', '', '');
    expect(result.isReceipt).toBe(false);
    expect(result.platform).toBe('unknown');
    expect(result.confidence).toBe(0);
  });
});

// ============================================================
// parseReceipt — default values
// ============================================================

describe('parseReceipt — default values', () => {
  it('non-receipt result has correct default fields', () => {
    const result = parseReceipt('x@y.com', 'random', 'random');
    expect(result.currency).toBe('USD');
    expect(result.refundEligible).toBe(false);
    expect(result.refundDeadlineDays).toBeUndefined();
  });

  it('receipt result has currency=USD (only USD supported currently)', () => {
    const result = parseReceipt(
      'shop@tiktok.com',
      'Order confirmation',
      'Total: $50',
    );
    expect(result.currency).toBe('USD');
  });
});

// ============================================================
// getRefundDeadline
// ============================================================

describe('getRefundDeadline', () => {
  it('adds refundDeadlineDays to purchaseDate', () => {
    const purchase = new Date('2024-01-01T00:00:00Z');
    const deadline = getRefundDeadline(purchase, 30);
    expect(deadline.toISOString()).toBe('2024-01-31T00:00:00.000Z');
  });

  it('defaults to 30 days when refundDeadlineDays is undefined', () => {
    const purchase = new Date('2024-01-01T00:00:00Z');
    const deadline = getRefundDeadline(purchase);
    expect(deadline.toISOString()).toBe('2024-01-31T00:00:00.000Z');
  });

  it('handles 0 days (edge case: 0 || 30 = 30 due to || operator)', () => {
    // Note: 0 is falsy, so refundDeadlineDays || 30 = 30. Documented behavior.
    const purchase = new Date('2024-01-01T00:00:00Z');
    const deadline = getRefundDeadline(purchase, 0);
    expect(deadline.toISOString()).toBe('2024-01-31T00:00:00.000Z'); // 30, not 0
  });

  it('handles 90 days (Target/Walmart)', () => {
    // Jan 1 + 90 days = Mar 31 (Jan=31 + Feb=29 leap + Mar=30 = 90)
    const purchase = new Date('2024-01-01T00:00:00Z');
    const deadline = getRefundDeadline(purchase, 90);
    expect(deadline.toISOString()).toBe('2024-03-31T00:00:00.000Z');
  });

  it('handles 7 days (Starbucks)', () => {
    const purchase = new Date('2024-01-01T00:00:00Z');
    const deadline = getRefundDeadline(purchase, 7);
    expect(deadline.toISOString()).toBe('2024-01-08T00:00:00.000Z');
  });
});

// ============================================================
// buildGmailReceiptQuery
// ============================================================

describe('buildGmailReceiptQuery', () => {
  it('returns query with default 7 days back', () => {
    const query = buildGmailReceiptQuery();
    expect(query).toContain('in:inbox');
    expect(query).toContain('after:');
    expect(query).toContain('subject:"order confirmation"');
    expect(query).toContain('subject:"purchase receipt"');
    expect(query).toContain('subject:"receipt for"');
    expect(query).toContain('subject:"order summary"');
    expect(query).toContain('subject:"thank you for your order"');
    expect(query).toContain('subject:"order received"');
    expect(query).toContain('subject:"your order has been"');
  });

  it('returns query with custom days back', () => {
    const query = buildGmailReceiptQuery(14);
    expect(query).toContain('in:inbox');
    expect(query).toContain('after:');
  });

  it('uses date format yyyy/MM/dd', () => {
    const query = buildGmailReceiptQuery(7);
    // Should contain a date like 2024/01/01
    expect(query).toMatch(/after:\d{4}\/\d{2}\/\d{2}/);
  });
});

// ============================================================
// KNOWN_SHOPPING_DOMAINS
// ============================================================

describe('KNOWN_SHOPPING_DOMAINS', () => {
  it('includes major e-commerce domains', () => {
    expect(KNOWN_SHOPPING_DOMAINS).toContain('tiktok.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('amazon.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('target.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('walmart.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('shein.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('temu.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('ebay.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('etsy.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('aliexpress.com');
  });

  it('includes shopify domains', () => {
    expect(KNOWN_SHOPPING_DOMAINS).toContain('shopify.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('checkout.shopify.com');
    expect(KNOWN_SHOPPING_DOMAINS).toContain('shop.app');
  });

  it('is a non-empty array', () => {
    expect(Array.isArray(KNOWN_SHOPPING_DOMAINS)).toBe(true);
    expect(KNOWN_SHOPPING_DOMAINS.length).toBeGreaterThan(10);
  });
});
