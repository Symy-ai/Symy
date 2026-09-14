/**
 * Tests for Impulse Detector (impulse-detector.ts)
 *
 * Covers:
 * - calculateImpulseScore: all 6 rules + score capping
 * - getScoreColor: 3-tier color thresholds (CSS custom properties)
 * - getScoreLabel: 3-tier labels (with/without i18n)
 * - getImpulseLevel: 3-tier level
 * - Exported constants: FLASH_SALE_KEYWORDS, IMPULSIVE_CATEGORIES
 */

import { describe, it, expect } from 'vitest';
import {
  calculateImpulseScore,
  getScoreColor,
  getScoreLabel,
  getImpulseLevel,
  FLASH_SALE_KEYWORDS,
  IMPULSIVE_CATEGORIES,
  type ImpulseEvent,
} from '@/lib/impulse-detector';

// Helper: create a base event for testing
function makeEvent(overrides: Partial<Omit<ImpulseEvent, 'impulseScore' | 'reasons' | 'id'>> = {}): Omit<ImpulseEvent, 'impulseScore' | 'reasons' | 'id'> {
  return {
    platform: 'amazon',
    item: 'Test item',
    amount: 50,
    timestamp: new Date('2026-07-06T14:00:00Z'), // 14:00 UTC = daytime
    category: 'Electronics',
    isLivestream: false,
    isFlashSale: false,
    ...overrides,
  };
}

describe('calculateImpulseScore', () => {
  it('returns base score 30 for basic purchase', () => {
    const result = calculateImpulseScore(makeEvent(), [], 100);
    expect(result.score).toBe(30);
    expect(result.reasons).toContain('Purchase detected');
  });

  it('Rule 1: late night (22:00-23:59 UTC) adds +30', () => {
    const event = makeEvent({ timestamp: new Date('2026-07-06T22:30:00Z') });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(60); // 30 base + 30 late night
    expect(result.reasons).toContain('Late night purchase (22:00-06:00)');
  });

  it('Rule 1: late night (00:00-05:59 UTC) adds +30', () => {
    const event = makeEvent({ timestamp: new Date('2026-07-06T03:00:00Z') });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(60);
  });

  it('Rule 1: daytime (06:00-21:59 UTC) does NOT add late night bonus', () => {
    const event = makeEvent({ timestamp: new Date('2026-07-06T12:00:00Z') });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(30);
    expect(result.reasons.some(r => r.includes('Late night'))).toBe(false);
  });

  it('Rule 2: amount > 2x average adds +20', () => {
    const event = makeEvent({ amount: 250 });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(50); // 30 base + 20 amount
    expect(result.reasons.some(r => r.includes('exceeds 2x average'))).toBe(true);
  });

  it('Rule 2: amount = exactly 2x average does NOT add bonus', () => {
    const event = makeEvent({ amount: 200 });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(30);
  });

  it('Rule 2: amount < 2x average does NOT add bonus', () => {
    const event = makeEvent({ amount: 150 });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(30);
  });

  it('Rule 2: average = 0 does NOT add bonus (avoids division issues)', () => {
    const event = makeEvent({ amount: 1000 });
    const result = calculateImpulseScore(event, [], 0);
    expect(result.score).toBe(30);
  });

  it('Rule 3: 1 previous order within 1hr adds +25', () => {
    const now = new Date('2026-07-06T14:00:00Z');
    const event = makeEvent({ timestamp: now });
    const previous: ImpulseEvent[] = [
      { ...makeEvent({ timestamp: new Date('2026-07-06T13:30:00Z') }), id: '1', impulseScore: 30, reasons: [] },
    ];
    const result = calculateImpulseScore(event, previous, 100);
    expect(result.score).toBe(55); // 30 base + 25 rapid
    expect(result.reasons.some(r => r.includes('orders in the last hour'))).toBe(true);
  });

  it('Rule 3: 0 previous orders within 1hr does NOT add bonus', () => {
    const now = new Date('2026-07-06T14:00:00Z');
    const event = makeEvent({ timestamp: now });
    const previous: ImpulseEvent[] = [
      { ...makeEvent({ timestamp: new Date('2026-07-06T12:00:00Z') }), id: '1', impulseScore: 30, reasons: [] }, // 2hrs ago
    ];
    const result = calculateImpulseScore(event, previous, 100);
    expect(result.score).toBe(30);
  });

  it('Rule 3: multiple previous orders within 1hr', () => {
    const now = new Date('2026-07-06T14:00:00Z');
    const event = makeEvent({ timestamp: now });
    const previous: ImpulseEvent[] = [
      { ...makeEvent({ timestamp: new Date('2026-07-06T13:30:00Z') }), id: '1', impulseScore: 30, reasons: [] },
      { ...makeEvent({ timestamp: new Date('2026-07-06T13:45:00Z') }), id: '2', impulseScore: 30, reasons: [] },
    ];
    const result = calculateImpulseScore(event, previous, 100);
    expect(result.score).toBe(55); // 30 base + 25 rapid
    expect(result.reasons.some(r => r.includes('3 orders'))).toBe(true);
  });

  it('Rule 4: flash sale adds +15', () => {
    const event = makeEvent({ isFlashSale: true });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(45); // 30 base + 15 flash
    expect(result.reasons.some(r => r.includes('Flash sale'))).toBe(true);
  });

  it('Rule 5: impulsive category adds +10', () => {
    const event = makeEvent({ category: 'Fashion & Accessories' });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(40); // 30 base + 10 category
    expect(result.reasons.some(r => r.includes('Impulsive category'))).toBe(true);
  });

  it('Rule 5: non-impulsive category does NOT add bonus', () => {
    const event = makeEvent({ category: 'Electronics' });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(30);
  });

  it('Rule 6: livestream adds +20', () => {
    const event = makeEvent({ isLivestream: true });
    const result = calculateImpulseScore(event, [], 100);
    expect(result.score).toBe(50); // 30 base + 20 livestream
    expect(result.reasons.some(r => r.includes('Livestream'))).toBe(true);
  });

  it('caps score at 100', () => {
    const event = makeEvent({
      timestamp: new Date('2026-07-06T23:00:00Z'), // late night +30
      amount: 500, // > 2x avg +20
      isFlashSale: true, // +15
      category: 'Beauty & Skincare', // +10
      isLivestream: true, // +20
    });
    const previous: ImpulseEvent[] = [
      { ...makeEvent({ timestamp: new Date('2026-07-06T22:30:00Z') }), id: '1', impulseScore: 30, reasons: [] },
    ];
    const result = calculateImpulseScore(event, previous, 100);
    // 30 + 30 + 20 + 25 + 15 + 10 + 20 = 150 → capped at 100
    expect(result.score).toBe(100);
  });

  it('all rules combined (correct math, capped at 100)', () => {
    const event = makeEvent({
      timestamp: new Date('2026-07-06T23:00:00Z'), // late night +30
      amount: 250, // > 2x avg +20
      isFlashSale: true, // +15
      category: 'Snacks & Treats', // +10
      isLivestream: false,
    });
    const result = calculateImpulseScore(event, [], 100);
    // 30 + 30 + 20 + 15 + 10 = 105 → capped at 100
    expect(result.score).toBe(100);
  });
});

describe('getScoreColor', () => {
  it('returns green for score < 30', () => {
    expect(getScoreColor(0)).toContain('--score-green');
    expect(getScoreColor(29)).toContain('--score-green');
  });

  it('returns yellow for score 30-60', () => {
    expect(getScoreColor(30)).toContain('--score-yellow');
    expect(getScoreColor(60)).toContain('--score-yellow');
  });

  it('returns guard gold for score > 60 without red', () => {
    expect(getScoreColor(61)).toContain('--guard-gold');
    expect(getScoreColor(100)).toContain('--guard-gold');
    expect(getScoreColor(61)).not.toMatch(/red|#C0392B|#b91c1c/i);
  });

  it('includes fallback hex color', () => {
    expect(getScoreColor(0)).toContain('#27AE60');
    expect(getScoreColor(30)).toContain('#F39C12');
    expect(getScoreColor(61)).toContain('#B8860B');
  });

  it('boundary: 29 is green, 30 is yellow', () => {
    expect(getScoreColor(29)).toContain('--score-green');
    expect(getScoreColor(30)).toContain('--score-yellow');
  });

  it('boundary: 60 is yellow, 61 is guard gold', () => {
    expect(getScoreColor(60)).toContain('--score-yellow');
    expect(getScoreColor(61)).toContain('--guard-gold');
  });
});

describe('getScoreLabel', () => {
  it('returns English label for low score (< 30) without t', () => {
    expect(getScoreLabel(0)).toBe('Clean pass');
    expect(getScoreLabel(29)).toBe('Clean pass');
  });

  it('returns English label for moderate score (30-60) without t', () => {
    expect(getScoreLabel(30)).toBe('Worth another look');
    expect(getScoreLabel(60)).toBe('Worth another look');
  });

  it('returns English label for high score (> 60) without t', () => {
    expect(getScoreLabel(61)).toBe('Guard moment');
    expect(getScoreLabel(100)).toBe('Guard moment');
  });

  it('uses i18n function when provided', () => {
    const t = (key: string) => `[zh]${key}`;
    expect(getScoreLabel(0, t)).toBe('[zh]impulseDetector.scoreLabels.low');
    expect(getScoreLabel(30, t)).toBe('[zh]impulseDetector.scoreLabels.moderate');
    expect(getScoreLabel(61, t)).toBe('[zh]impulseDetector.scoreLabels.high');
  });

  it('boundaries: 29 is low, 30 is moderate', () => {
    expect(getScoreLabel(29)).toBe('Clean pass');
    expect(getScoreLabel(30)).toBe('Worth another look');
  });

  it('boundaries: 60 is moderate, 61 is high', () => {
    expect(getScoreLabel(60)).toBe('Worth another look');
    expect(getScoreLabel(61)).toBe('Guard moment');
  });
});

describe('getImpulseLevel', () => {
  it('returns "success" for score < 30', () => {
    expect(getImpulseLevel(0)).toBe('success');
    expect(getImpulseLevel(29)).toBe('success');
  });

  it('returns "stable" for score 30-60', () => {
    expect(getImpulseLevel(30)).toBe('stable');
    expect(getImpulseLevel(60)).toBe('stable');
  });

  it('returns "alert" for score > 60', () => {
    expect(getImpulseLevel(61)).toBe('alert');
    expect(getImpulseLevel(100)).toBe('alert');
  });

  it('boundaries: 29 is success, 30 is stable', () => {
    expect(getImpulseLevel(29)).toBe('success');
    expect(getImpulseLevel(30)).toBe('stable');
  });

  it('boundaries: 60 is stable, 61 is alert', () => {
    expect(getImpulseLevel(60)).toBe('stable');
    expect(getImpulseLevel(61)).toBe('alert');
  });
});

describe('exported constants', () => {
  it('FLASH_SALE_KEYWORDS includes common phrases', () => {
    expect(FLASH_SALE_KEYWORDS).toContain('flash sale');
    expect(FLASH_SALE_KEYWORDS).toContain('limited time');
    expect(FLASH_SALE_KEYWORDS).toContain('hurry');
    expect(FLASH_SALE_KEYWORDS).toContain('last chance');
  });

  it('FLASH_SALE_KEYWORDS are all lowercase (for case-insensitive matching)', () => {
    for (const keyword of FLASH_SALE_KEYWORDS) {
      expect(keyword).toBe(keyword.toLowerCase());
    }
  });

  it('FLASH_SALE_KEYWORDS has reasonable count', () => {
    expect(FLASH_SALE_KEYWORDS.length).toBeGreaterThanOrEqual(10);
  });

  it('IMPULSIVE_CATEGORIES includes common impulsive categories', () => {
    expect(IMPULSIVE_CATEGORIES).toContain('Fashion & Accessories');
    expect(IMPULSIVE_CATEGORIES).toContain('Beauty & Skincare');
    expect(IMPULSIVE_CATEGORIES).toContain('Snacks & Treats');
  });

  it('IMPULSIVE_CATEGORIES has reasonable count', () => {
    expect(IMPULSIVE_CATEGORIES.length).toBeGreaterThanOrEqual(5);
  });
});
