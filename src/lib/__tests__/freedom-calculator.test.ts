/**
 * Tests for freedom-calculator.ts — pure functions for freedom time calculation
 */

import { describe, it, expect } from 'vitest';
import {
  calculateFreedom,
  formatFreedomMonths,
  formatFreedomDays,
  DEFAULT_HOURLY_RATE,
  WORK_DAYS_PER_MONTH,
  WORK_HOURS_PER_DAY,
} from '../freedom-calculator';

describe('calculateFreedom', () => {
  it('calculates freedom time for $1000 saved at default $25/hour (batch51-b 收敛)', () => {
    const result = calculateFreedom(1000);
    expect(result.totalSaved).toBe(1000);
    expect(result.hours).toBe(40); // 1000 / 25
    expect(result.days).toBe(5); // 40 / 8
    expect(result.months).toBeCloseTo(0.227, 2); // 5 / 22
    expect(result.hourlyRate).toBe(DEFAULT_HOURLY_RATE);
  });

  it('calculates with custom hourly rate', () => {
    const result = calculateFreedom(1000, 50);
    expect(result.hours).toBe(20); // 1000 / 50
    expect(result.days).toBe(2.5); // 20 / 8
    expect(result.hourlyRate).toBe(50);
  });

  it('handles zero totalSaved', () => {
    const result = calculateFreedom(0);
    expect(result.totalSaved).toBe(0);
    expect(result.hours).toBe(0);
    expect(result.days).toBe(0);
    expect(result.months).toBe(0);
  });

  it('handles negative totalSaved (clamps to 0)', () => {
    const result = calculateFreedom(-500);
    expect(result.totalSaved).toBe(0);
    expect(result.hours).toBe(0);
  });

  it('handles NaN totalSaved (clamps to 0)', () => {
    const result = calculateFreedom(NaN);
    expect(result.totalSaved).toBe(0);
    expect(result.hours).toBe(0);
  });

  // 🔧 ARCH fix (Round 42): division by zero guard
  it('handles hourlyRate=0 (falls back to default)', () => {
    const result = calculateFreedom(1000, 0);
    expect(result.hourlyRate).toBe(DEFAULT_HOURLY_RATE); // falls back, not 0
    expect(result.hours).toBe(40); // 1000 / 25 (not Infinity)
    expect(Number.isFinite(result.hours)).toBe(true);
  });

  it('handles negative hourlyRate (falls back to default)', () => {
    const result = calculateFreedom(1000, -10);
    expect(result.hourlyRate).toBe(DEFAULT_HOURLY_RATE);
    expect(result.hours).toBe(40);
  });

  it('handles NaN hourlyRate (falls back to default)', () => {
    const result = calculateFreedom(1000, NaN);
    expect(result.hourlyRate).toBe(DEFAULT_HOURLY_RATE);
    expect(result.hours).toBe(40);
  });

  it('produces consistent relationships (hours → days → months)', () => {
    const result = calculateFreedom(5000, 25);
    expect(result.hours).toBe(200); // 5000 / 25
    expect(result.days).toBe(result.hours / WORK_HOURS_PER_DAY);
    expect(result.months).toBe(result.days / WORK_DAYS_PER_MONTH);
  });
});

describe('formatFreedomMonths', () => {
  it('formats 0 as "0.0"', () => {
    expect(formatFreedomMonths(0)).toBe('0.0');
  });

  it('formats negative as "0.0"', () => {
    expect(formatFreedomMonths(-5)).toBe('0.0');
  });

  it('truncates to 1 decimal (not rounds)', () => {
    expect(formatFreedomMonths(4.29)).toBe('4.2'); // truncates, not 4.3
  });

  it('formats exact 1 decimal', () => {
    expect(formatFreedomMonths(0.1)).toBe('0.1');
  });

  it('formats whole numbers (JS number toString drops .0)', () => {
    // Note: Math.floor(12 * 10) / 10 + '' = "12" (not "12.0") — JS number toString
    expect(formatFreedomMonths(12)).toBe('12');
  });

  it('formats large numbers', () => {
    expect(formatFreedomMonths(100.99)).toBe('100.9');
  });
});

describe('formatFreedomDays', () => {
  it('formats 0 as "0"', () => {
    expect(formatFreedomDays(0)).toBe('0');
  });

  it('formats negative as "0"', () => {
    expect(formatFreedomDays(-5)).toBe('0');
  });

  it('floors to integer (not rounds)', () => {
    expect(formatFreedomDays(0.9)).toBe('0'); // floors, not 1
    expect(formatFreedomDays(126.7)).toBe('126'); // floors, not 127
  });

  it('formats exact integers', () => {
    expect(formatFreedomDays(42)).toBe('42');
  });
});
