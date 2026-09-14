/**
 * BNPL Detector Tests — Round 120 audit fix (AUDIT-4)
 *
 * 🔧 之前 bnpl-detector.ts 0% test coverage, regex-heavy, Round 118/119 false-positive fixes untested
 * 此测试覆盖:
 * - 所有 BNPL 关键词检测 (Klarna/Afterpay/Affirm/Zip/Quadpay/Sezzle/PayPal)
 * - "4 payments of $X" / "N installments of $X" / "$X/month" 金额提取
 * - "pay in 4" / "N payments" 期数提取
 * - 总金额计算 (perPayment * numPayments)
 * - 误匹配防护 (zip code, zipper, etc.)
 * - buildBNPLContextPrefix 输出格式
 * - lifeHours 计算
 */

import { describe, it, expect } from 'vitest';
import { detectBNPL, buildBNPLContextPrefix } from '@/lib/bnpl-detector';

describe('detectBNPL', () => {
  describe('keyword detection', () => {
    it.each([
      ['Klarna offers 4 payments of $150', 'klarna'],
      ['klarna is great', 'klarna'],
      ['KLARNA', 'klarna'],
      ['Afterpay lets me split this', 'afterpay'],
      ['Affirm loan', 'affirm'],
      ['Zip Pay is convenient', 'zip pay'],
      ['Zip Quadpay', 'quadpay'],
      ['Quadpay', 'quadpay'],
      ['Sezzle', 'sezzle'],
      ['PayPal Pay in 4', 'paypal pay in'],
    ])('detects %s', (text, expectedKey) => {
      const result = detectBNPL(text);
      expect(result.detected).toBe(true);
      expect(result.keywords.some(k => k.toLowerCase().includes(expectedKey.toLowerCase()))).toBe(true);
    });
  });

  describe('phrase detection', () => {
    it.each([
      'pay in 4',
      '4 payments of $150',
      '4 installments of $75',
      'interest-free',
      'interest free',
      'buy now pay later',
      'installment plan',
      'split into 4 payments',
      'split into 3 payments',
      // 🔧 Round 125 fix: $X/month removed — false positive with rent/subscriptions
    ])('detects phrase: %s', (phrase) => {
      const result = detectBNPL(`I want to use ${phrase}`);
      expect(result.detected).toBe(true);
    });
  });

  describe('false positive prevention', () => {
    it.each([
      'my zip code is 12345',
      'I have a zipper on my jacket',
      'I need to zip the file',
      'the zip drive is broken',
      // 🔧 Round 125 fix: $X/month false positives
      'My rent is $1500/month',
      'Netflix $15/month subscription',
      'I pay $80/mo for gym',
      'My car payment is $400/month',
    ])('does NOT detect: %s', (text) => {
      const result = detectBNPL(text);
      expect(result.detected).toBe(false);
    });
  });

  describe('amount extraction', () => {
    it('extracts per-payment amount from "4 payments of $150"', () => {
      const result = detectBNPL('Klarna 4 payments of $150');
      expect(result.perPaymentAmount).toBe(150);
      expect(result.numPayments).toBe(4);
      expect(result.totalAmount).toBe(600);
    });

    it('extracts per-payment amount from "4 installments of $75"', () => {
      const result = detectBNPL('Afterpay 4 installments of $75');
      expect(result.perPaymentAmount).toBe(75);
      expect(result.numPayments).toBe(4);
      expect(result.totalAmount).toBe(300);
    });

    it('extracts from "pay in 4" without amount', () => {
      const result = detectBNPL('PayPal pay in 4');
      expect(result.numPayments).toBe(4);
      expect(result.perPaymentAmount).toBeUndefined();
    });

    // 🔧 Round 125 fix: $X/month no longer triggers BNPL detection (false positive with rent/subscriptions)
    it('does NOT detect "$150/month" as BNPL (rent/subscription false positive)', () => {
      const result = detectBNPL('$150/month for 12 months');
      expect(result.detected).toBe(false);
    });

    it('does NOT detect "$150/mo" alone as BNPL', () => {
      const result = detectBNPL('$150/mo');
      expect(result.detected).toBe(false);
    });

    it('detects "$150/mo installment plan" via "installment" keyword', () => {
      const result = detectBNPL('$150/mo installment plan');
      expect(result.detected).toBe(true);
    });

    it('handles comma-formatted amounts ($1,500)', () => {
      const result = detectBNPL('4 payments of $1,500');
      expect(result.perPaymentAmount).toBe(1500);
      expect(result.totalAmount).toBe(6000);
    });

    it('uses itemAmount when no per-payment detected', () => {
      const result = detectBNPL('buy now pay later', 599);
      expect(result.itemAmount).toBe(599);
      expect(result.totalAmount).toBe(599);
    });
  });

  describe('numPayments extraction', () => {
    it.each([
      ['Klarna 4 payments of $150', 4],
      ['Klarna 3 payments of $100', 3],
      ['Klarna 12 payments of $50', 12],
      ['Affirm 4 installments of $75', 4],
      ['pay in 4', 4],
      ['pay in 3', 3],
    ])('extracts %s → %i', (phrase, expected) => {
      const result = detectBNPL(phrase);
      expect(result.numPayments).toBe(expected);
    });
  });

  describe('totalAmount calculation', () => {
    it('calculates total when both perPayment and numPayments present', () => {
      const result = detectBNPL('Klarna 4 payments of $150');
      expect(result.totalAmount).toBe(600);
    });

    it('uses itemAmount when perPayment missing', () => {
      const result = detectBNPL('buy now pay later', 999);
      expect(result.totalAmount).toBe(999);
    });

    it('uses perPayment when numPayments missing', () => {
      const result = detectBNPL('$150/month interest-free');
      expect(result.totalAmount).toBe(150);
    });
  });

  describe('no detection', () => {
    it('returns detected=false for empty string', () => {
      const result = detectBNPL('');
      expect(result.detected).toBe(false);
      expect(result.keywords).toEqual([]);
    });

    it('returns detected=false for non-BNPL message', () => {
      const result = detectBNPL('I want to buy a phone');
      expect(result.detected).toBe(false);
    });
  });
});

describe('buildBNPLContextPrefix', () => {
  it('returns empty string when not detected', () => {
    const result = buildBNPLContextPrefix({ detected: false, keywords: [] });
    expect(result).toBe('');
  });

  it('includes keywords in output (case-insensitive)', () => {
    const result = detectBNPL('Klarna 4 payments of $150');
    const prefix = buildBNPLContextPrefix(result);
    expect(prefix).toContain('[BNPL TRAP DETECTED:');
    expect(prefix.toLowerCase()).toContain('klarna');
  });

  it('includes per-payment breakdown when available', () => {
    const result = detectBNPL('Klarna 4 payments of $150');
    const prefix = buildBNPLContextPrefix(result);
    expect(prefix).toContain('Per payment: $150 × 4 = $600');
    expect(prefix).toContain('manipulation');
  });

  it('includes total cost when no per-payment breakdown', () => {
    const result = detectBNPL('buy now pay later', 599);
    const prefix = buildBNPLContextPrefix(result);
    expect(prefix).toContain('Total cost: $599');
  });

  it('includes life hours when hourlyRate provided', () => {
    const result = detectBNPL('Klarna 4 payments of $150');
    const prefix = buildBNPLContextPrefix(result, 20);
    expect(prefix).toContain('30 hours of your life');
  });

  it('omits life hours when hourlyRate is 0 or undefined', () => {
    const result = detectBNPL('Klarna 4 payments of $150');
    const prefix = buildBNPLContextPrefix(result);
    expect(prefix).not.toContain('hours of your life');
  });

  it('instructs AI to reflect ONE risk, not list all', () => {
    const result = detectBNPL('Klarna 4 payments of $150');
    const prefix = buildBNPLContextPrefix(result);
    expect(prefix).toContain('Reflect ONE risk');
    expect(prefix).toContain('Do NOT list all risks');
  });

  it('handles missing total and perPayment gracefully', () => {
    const result = { detected: true, keywords: ['klarna'] };
    const prefix = buildBNPLContextPrefix(result);
    expect(prefix).toContain('[BNPL TRAP DETECTED:');
    // Should not contain NaN or undefined
    expect(prefix).not.toContain('NaN');
    expect(prefix).not.toContain('undefined');
  });
});
