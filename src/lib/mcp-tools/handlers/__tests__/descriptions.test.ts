/**
 * Tests for MCP Tool Descriptions (mcp-tools/handlers/descriptions.ts)
 *
 * 🔧 小象守护版: 测试更新为验证守护文案 + 生命翻译
 *
 * Covers:
 * - getLocaleFromArgs: locale extraction
 * - getHourlyRateFromArgs: hourly rate extraction
 * - challengeCompletedDesc / challengeFailedDesc: guardian copy + life translation
 * - tokensAwardedDesc: en/zh
 * - vitalityAdjustedDesc: en/zh
 * - dreamFundProgressDesc: en/zh with life translation
 * - badgeUnlockedDesc: en/zh
 * - impulseRecordedDesc: guardian copy + life translation
 * - impulseDamageDesc / refundBoostDesc / mindfulRecoveryDesc: guardian copy + life translation
 */

import { describe, it, expect } from 'vitest';
import {
  getLocaleFromArgs,
  getHourlyRateFromArgs,
  calcLifeHours,
  challengeCompletedDesc,
  challengeFailedDesc,
  tokensAwardedDesc,
  vitalityAdjustedDesc,
  dreamFundProgressDesc,
  badgeUnlockedDesc,
  impulseRecordedDesc,
  impulseDamageDesc,
  refundBoostDesc,
  mindfulRecoveryDesc,
  type Locale,
} from '@/lib/mcp-tools/handlers/descriptions';

describe('getLocaleFromArgs', () => {
  it('returns "zh" when args.locale === "zh"', () => {
    expect(getLocaleFromArgs({ locale: 'zh' })).toBe('zh');
  });

  it('returns "en" when args.locale === "en"', () => {
    expect(getLocaleFromArgs({ locale: 'en' })).toBe('en');
  });

  it('returns "en" when args.locale is missing', () => {
    expect(getLocaleFromArgs({})).toBe('en');
  });

  it('returns "en" when args.locale is undefined', () => {
    expect(getLocaleFromArgs({ locale: undefined })).toBe('en');
  });

  it('returns "en" for invalid locale string', () => {
    expect(getLocaleFromArgs({ locale: 'fr' })).toBe('en');
    expect(getLocaleFromArgs({ locale: 'ja' })).toBe('en');
  });

  it('returns "en" when args.locale is non-string', () => {
    expect(getLocaleFromArgs({ locale: 123 })).toBe('en');
    expect(getLocaleFromArgs({ locale: true })).toBe('en');
    expect(getLocaleFromArgs({ locale: null })).toBe('en');
  });

  it('returns "en" for empty string locale', () => {
    expect(getLocaleFromArgs({ locale: '' })).toBe('en');
  });
});

describe('getHourlyRateFromArgs', () => {
  it('returns the rate when args.hourlyRate is a valid number', () => {
    expect(getHourlyRateFromArgs({ hourlyRate: 50 })).toBe(50);
    expect(getHourlyRateFromArgs({ hourlyRate: 20 })).toBe(20);
  });

  // 🔧 P0-3 fix: returns undefined (not 20) when args.hourlyRate is missing/invalid,
  //    so `getHourlyRateFromArgs(args) || await getUserHourlyRate(userId)` correctly falls back.
  it('returns undefined when args.hourlyRate is missing', () => {
    expect(getHourlyRateFromArgs({})).toBeUndefined();
  });

  it('returns undefined when args.hourlyRate is invalid', () => {
    expect(getHourlyRateFromArgs({ hourlyRate: 0 })).toBeUndefined();
    expect(getHourlyRateFromArgs({ hourlyRate: -5 })).toBeUndefined();
    expect(getHourlyRateFromArgs({ hourlyRate: 99999 })).toBeUndefined();
    expect(getHourlyRateFromArgs({ hourlyRate: 'abc' })).toBeUndefined();
  });
});

describe('calcLifeHours (P0-3 shared function)', () => {
  it('calculates hours correctly for $50/hr', () => {
    expect(calcLifeHours(89, 50)).toBeCloseTo(1.8, 1);
    expect(calcLifeHours(1099, 50)).toBeCloseTo(22.0, 1);
  });

  it('calculates hours correctly for $20/hr', () => {
    expect(calcLifeHours(89, 20)).toBeCloseTo(4.45, 1);
    expect(calcLifeHours(100, 20)).toBeCloseTo(5.0, 1);
  });

  it('calculates hours correctly for $100/hr', () => {
    expect(calcLifeHours(100, 100)).toBeCloseTo(1.0, 1);
    expect(calcLifeHours(1099, 100)).toBeCloseTo(10.99, 1);
  });

  it('falls back to default $25/hr when hourlyRate is 0 or negative', () => {
    expect(calcLifeHours(100, 0)).toBeCloseTo(4.0, 1);
    expect(calcLifeHours(100, -5)).toBeCloseTo(4.0, 1);
  });

  it('handles price=0', () => {
    expect(calcLifeHours(0, 50)).toBe(0);
  });
});

describe('challengeCompletedDesc (guardian voice)', () => {
  it('generates English description with life translation (default $25/hr)', () => {
    const result = challengeCompletedDesc('en', 'standard', 100, 'Jacket', 5, 5, 15);
    expect(result).toContain('You held the gate on');
    expect(result).toContain('Jacket');
    expect(result).toContain('$100');
    // 🔧 生命翻译: $100 / $25 = 4.0 hours
    expect(result).toContain('4.0 hours of life');
    // 🔧 不应包含工具哲学文案
    expect(result).not.toContain('Challenge completed');
    expect(result).not.toContain('saved $');
    expect(result).not.toContain('tokens');
    expect(result).not.toContain('vitality');
    expect(result).not.toContain('XP');
  });

  it('generates English description with custom hourly rate ($50/hr)', () => {
    const result = challengeCompletedDesc('en', 'standard', 100, 'Jacket', 5, 5, 15, 50);
    // 🔧 $100 / $50 = 2.0 hours
    expect(result).toContain('2.0 hours of life');
  });

  it('generates English description without item name', () => {
    const result = challengeCompletedDesc('en', 'quick_pass', 30, undefined, 3, 2, 8);
    expect(result).toContain('You held the gate on');
    expect(result).toContain('$30');
    // Should still have life translation
    expect(result).toContain('hours of life');
  });

  it('generates Chinese description with life translation', () => {
    const result = challengeCompletedDesc('zh', 'standard', 100, '夹克', 5, 5, 15);
    expect(result).toContain('你守住了');
    expect(result).toContain('夹克');
    expect(result).toContain('$100');
    // 🔧 生命翻译
    expect(result).toContain('小时生命');
    // 🔧 不应包含工具哲学文案
    expect(result).not.toContain('挑战完成');
    expect(result).not.toContain('节省');
    expect(result).not.toContain('代币');
  });

  it('generates Chinese description with custom hourly rate', () => {
    const result = challengeCompletedDesc('zh', 'standard', 100, '夹克', 5, 5, 15, 50);
    expect(result).toContain('2.0 小时生命');
  });
});

describe('challengeFailedDesc (guardian voice — no "failure")', () => {
  it('generates English description with a next-step pause', () => {
    const result = challengeFailedDesc('en', 'standard', 'Jacket', 999, 20);
    expect(result).toContain('went straight through — next time pause with Symy first');
    expect(result).toContain('Jacket');
    // 🔧 生命翻译: $999 / $20 = 50.0 hours
    expect(result).toContain('$999');
    expect(result).toContain('50.0 hours of life');
    // 🔧 不应包含评判性文案
    expect(result).not.toContain('Challenge failed');
    expect(result).not.toContain('Vitality decreased');
  });

  it('generates English without amount (no life translation)', () => {
    const result = challengeFailedDesc('en', 'boss', undefined, 0, 20);
    expect(result).toContain('pause with Symy');
    expect(result).not.toContain('hours of life');
  });

  it('generates Chinese description with a next-step pause', () => {
    const result = challengeFailedDesc('zh', 'standard', '夹克', 999, 20);
    expect(result).toContain('下次小象陪你先停一停');
    expect(result).toContain('夹克');
    expect(result).toContain('$999');
    expect(result).toContain('小时生命');
    // 🔧 不应包含评判性文案
    expect(result).not.toContain('挑战失败');
    expect(result).not.toContain('生命力下降');
  });
});

describe('tokensAwardedDesc', () => {
  it('generates English description', () => {
    const result = tokensAwardedDesc('en', 5, 'survival', 3, 10);
    expect(result).toContain('+5 tokens');
    expect(result).toContain('survival');
  });

  it('generates Chinese description with reason mapping', () => {
    expect(tokensAwardedDesc('zh', 5, 'survival', 3, 10)).toContain('生存');
    expect(tokensAwardedDesc('zh', 5, 'growth', 3, 10)).toContain('成长');
    expect(tokensAwardedDesc('zh', 5, 'pleasure', 3, 10)).toContain('愉悦');
  });

  it('falls back to raw reason for unknown reason in Chinese', () => {
    const result = tokensAwardedDesc('zh', 5, 'unknown', 3, 10);
    expect(result).toContain('unknown');
  });
});

describe('vitalityAdjustedDesc', () => {
  it('generates English for positive amount', () => {
    const result = vitalityAdjustedDesc('en', 10, 80, 'healing kit');
    expect(result).toContain('+10');
    expect(result).toContain('80');
  });

  it('generates English for negative amount (no + prefix)', () => {
    const result = vitalityAdjustedDesc('en', -10, 60, 'impulse damage');
    expect(result).toContain('-10');
    expect(result).not.toContain('+-10');
  });

  // 🔧 P0-2 fix: English path now also guards undefined → '?' (was rendering literal "undefined")
  it('handles undefined newVitality in English (shows ?)', () => {
    const result = vitalityAdjustedDesc('en', 10, undefined, 'test');
    expect(result).toContain('?');
    expect(result).not.toContain('undefined');
  });

  it('handles undefined newVitality in Chinese (shows ?)', () => {
    const result = vitalityAdjustedDesc('zh', 10, undefined, 'test');
    expect(result).toContain('?');
  });

  it('generates Chinese description', () => {
    const result = vitalityAdjustedDesc('zh', 10, 80, '治愈包');
    expect(result).toContain('+10');
    expect(result).toContain('80');
  });
});

describe('dreamFundProgressDesc (guardian voice + life translation)', () => {
  it('generates English with life translation', () => {
    const result = dreamFundProgressDesc('en', 100, 'Iceland Trip', 50, false, 20);
    expect(result).toContain('Added $100');
    expect(result).toContain('Iceland Trip');
    expect(result).toContain('50%');
    // 🔧 生命翻译: $100 / $20 = 5.0 hours
    expect(result).toContain('5.0 hours of life');
  });

  it('generates English with custom hourly rate', () => {
    const result = dreamFundProgressDesc('en', 100, 'Iceland Trip', 50, false, 50);
    expect(result).toContain('2.0 hours of life');
  });

  it('generates Chinese with life translation', () => {
    const result = dreamFundProgressDesc('zh', 100, '冰岛旅行', 50, false, 20);
    expect(result).toContain('存入 $100');
    expect(result).toContain('冰岛旅行');
    expect(result).toContain('进度');
    expect(result).toContain('5.0 小时生命');
  });
});

describe('badgeUnlockedDesc', () => {
  it('generates English', () => {
    expect(badgeUnlockedDesc('en', 'first_save')).toContain('Badge');
    expect(badgeUnlockedDesc('en', 'first_save')).toContain('first_save');
  });

  it('generates Chinese', () => {
    expect(badgeUnlockedDesc('zh', 'first_save')).toContain('徽章');
    expect(badgeUnlockedDesc('zh', 'first_save')).toContain('first_save');
  });
});

describe('impulseRecordedDesc (guardian voice + life translation)', () => {
  it('generates English for low score (< 60) — "You held the gate"', () => {
    const result = impulseRecordedDesc('en', 50, 'Amazon', 30, 0, 80, 20);
    expect(result).toContain('You held the gate');
    expect(result).toContain('$50');
    expect(result).toContain('Amazon');
    // 🔧 生命翻译: $50 / $20 = 2.5 hours
    expect(result).toContain('2.5 hours of life');
    // 🔧 不应包含工具哲学文案
    expect(result).not.toContain('Low-inducement');
    expect(result).not.toContain('Not induced enough');
  });

  it('generates English for high score (>= 60) with a next-step pause', () => {
    const result = impulseRecordedDesc('en', 200, 'TikTok', 85, -15, 65, 20);
    expect(result).toContain('pause with Symy');
    expect(result).toContain('$200');
    expect(result).toContain('TikTok');
    // 🔧 生命翻译: $200 / $20 = 10.0 hours
    expect(result).toContain('10.0 hours of life');
  });

  it('generates Chinese for low score — "你守住了"', () => {
    const result = impulseRecordedDesc('zh', 50, 'Amazon', 30, 0, 80, 20);
    expect(result).toContain('你守住了');
    expect(result).toContain('小时生命');
  });

  it('generates Chinese for high score with a next-step pause', () => {
    const result = impulseRecordedDesc('zh', 200, 'TikTok', 85, -15, 65, 20);
    expect(result).toContain('下次小象陪你先停一停');
    expect(result).toContain('小时生命');
  });

  it('boundary: score 59 holds the gate, score 60 pauses next time', () => {
    const lowResult = impulseRecordedDesc('en', 50, 'Test', 59, 0, 80, 20);
    const highResult = impulseRecordedDesc('en', 50, 'Test', 60, -5, 75, 20);
    expect(lowResult).toContain('You held the gate');
    expect(highResult).toContain('pause with Symy');
  });
});

describe('impulseDamageDesc (guardian voice + life translation)', () => {
  it('generates English with item name and next-step pause', () => {
    const result = impulseDamageDesc('en', 99.99, 'Amazon', 'Wireless Earbuds', 20);
    expect(result).toContain('pause with Symy');
    expect(result).toContain('Wireless Earbuds');
    expect(result).toContain('$99.99');
    expect(result).toContain('Amazon');
    // 🔧 生命翻译: $99.99 / $20 = 5.0 hours
    expect(result).toContain('hours of life');
  });

  it('generates English without item name', () => {
    const result = impulseDamageDesc('en', 99.99, 'Amazon', undefined, 20);
    expect(result).toContain('$99.99');
    expect(result).toContain('hours of life');
  });

  it('generates Chinese with item name', () => {
    const result = impulseDamageDesc('zh', 99.99, 'Amazon', '无线耳机', 20);
    expect(result).toContain('下次小象陪你先停一停');
    expect(result).toContain('无线耳机');
    expect(result).toContain('$99.99');
    expect(result).toContain('小时生命');
  });

  it('formats amount with 2 decimal places', () => {
    const result = impulseDamageDesc('en', 100, 'Amazon', undefined, 20);
    expect(result).toContain('$100.00');
  });
});

describe('refundBoostDesc (guardian voice + life translation)', () => {
  it('generates English with item name', () => {
    const result = refundBoostDesc('en', 49.99, 'Amazon', 'Phone Case', 20);
    expect(result).toContain('Refund received');
    expect(result).toContain('Phone Case');
    expect(result).toContain('$49.99');
    expect(result).toContain('hours of life');
  });

  it('generates Chinese without item name', () => {
    const result = refundBoostDesc('zh', 49.99, 'Amazon', undefined, 20);
    expect(result).toContain('退款到账');
    expect(result).toContain('$49.99');
    expect(result).toContain('小时生命');
  });
});

describe('mindfulRecoveryDesc (guardian voice + life translation)', () => {
  it('generates English — "You held the gate" (resisted)', () => {
    const result = mindfulRecoveryDesc('en', 129.99, 'TikTok', 20);
    expect(result).toContain('You held the gate');
    expect(result).toContain('$129.99');
    expect(result).toContain('TikTok');
    expect(result).toContain('hours of life');
    // 🔧 不应包含工具哲学文案
    expect(result).not.toContain('Resisted impulse');
  });

  it('generates Chinese — "你守住了"', () => {
    const result = mindfulRecoveryDesc('zh', 129.99, 'TikTok', 20);
    expect(result).toContain('你守住了');
    expect(result).toContain('$129.99');
    expect(result).toContain('小时生命');
  });
});

describe('integration: all descriptions return non-empty strings', () => {
  const locales: Locale[] = ['en', 'zh'];

  it('challengeCompletedDesc returns non-empty for all locales', () => {
    for (const locale of locales) {
      expect(challengeCompletedDesc(locale, 'standard', 100, 'item', 5, 5, 15).length).toBeGreaterThan(10);
    }
  });

  it('all description functions handle edge cases without crashing', () => {
    // Empty strings, zero amounts, undefined optional params
    expect(challengeCompletedDesc('en', '', 0, undefined, 0, 0, 0)).toBeTruthy();
    expect(challengeFailedDesc('en', '', undefined)).toBeTruthy();
    expect(tokensAwardedDesc('en', 0, '', 0, 0)).toBeTruthy();
    expect(vitalityAdjustedDesc('en', 0, 0, '')).toBeTruthy();
    expect(dreamFundProgressDesc('en', 0, '', 0, false)).toBeTruthy();
    expect(badgeUnlockedDesc('en', '')).toBeTruthy();
    expect(impulseRecordedDesc('en', 0, '', 0, 0, 0)).toBeTruthy();
    expect(impulseDamageDesc('en', 0, '')).toBeTruthy();
    expect(refundBoostDesc('en', 0, '')).toBeTruthy();
    expect(mindfulRecoveryDesc('en', 0, '')).toBeTruthy();
  });
});
