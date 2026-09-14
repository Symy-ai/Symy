import { describe, expect, it } from 'vitest';
import { clampHourlyRate, DEFAULT_HOURLY_RATE, formatFreedomTime, moneyToFreedomLabel, moneyToHours } from '../freedom-time';

describe('freedom-time', () => {
  it('converts money to hours with default and custom rates', () => {
    expect(moneyToHours(100)).toBe(100 / DEFAULT_HOURLY_RATE);
    expect(moneyToHours(100, 50)).toBe(2);
    expect(moneyToHours(-5)).toBe(0);
    expect(moneyToHours(Number.NaN)).toBe(0);
    expect(moneyToHours(100, 0)).toBe(100 / DEFAULT_HOURLY_RATE);
  });

  it('formats minutes under 1h', () => {
    expect(formatFreedomTime(0.5, 'zh')).toBe('30 分钟');
    expect(formatFreedomTime(0.5, 'en')).toBe('30 min');
    expect(formatFreedomTime(0.001, 'zh')).toBe('1 分钟');
  });

  it('formats 1 decimal under 10h, integer above', () => {
    expect(formatFreedomTime(4.45, 'zh')).toBe('4.5 小时');
    expect(formatFreedomTime(4.45, 'en')).toBe('4.5 hours');
    expect(formatFreedomTime(216, 'zh')).toBe('216 小时');
  });

  it('handles zero and invalid gracefully', () => {
    expect(formatFreedomTime(0)).toBe('0 小时');
    expect(formatFreedomTime(-3, 'en')).toBe('0 hours');
  });

  it('one-step label', () => {
    expect(moneyToFreedomLabel(100, 'zh')).toBe('4.0 小时');
    expect(moneyToFreedomLabel(1000, 'en', 50)).toBe('20 hours');
  });
});

describe('clampHourlyRate (batch51-b)', () => {
  it('passes through in-range values', () => {
    expect(clampHourlyRate(1)).toBe(1);
    expect(clampHourlyRate(25)).toBe(25);
    expect(clampHourlyRate(500)).toBe(500);
    expect(clampHourlyRate(37.5)).toBe(37.5);
  });

  it('clamps below-min to 1 and above-max to 500', () => {
    expect(clampHourlyRate(0.2)).toBe(1);
    expect(clampHourlyRate(0)).toBe(1);
    expect(clampHourlyRate(-10)).toBe(1);
    expect(clampHourlyRate(999)).toBe(500);
    expect(clampHourlyRate(1000000)).toBe(500);
  });

  it('falls back to default on non-finite input', () => {
    expect(clampHourlyRate(Number.NaN)).toBe(DEFAULT_HOURLY_RATE);
    expect(clampHourlyRate(Number.POSITIVE_INFINITY)).toBe(DEFAULT_HOURLY_RATE);
  });
});
