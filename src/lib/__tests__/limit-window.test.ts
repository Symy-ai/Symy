import { describe, expect, it } from 'vitest';

import { TEST_PERIOD_5MIN, getLimitResetDescription, getLimitWindow, isWindowReset } from '../limit-window';

/**
 * limit-window.ts (74行) — 限流窗口 (Round 78 测试期 5 分钟 / Round 109 恢复每日)。
 *
 * 锁定:
 * - TEST_PERIOD_5MIN=false (Round 109 生产态锚 — 抚摸刷分 bug 修复)
 * - getLimitWindow: UTC 4:00 AM 分界 (3:59 与 4:00 不同日; 与 gacha/healing-kit 对齐)
 * - isWindowReset: null/异窗 → true; 同窗 → false
 * - reset 描述生产期 '4:00 AM'
 */
describe('limit-window 限流窗口', () => {
  it('TEST_PERIOD_5MIN=false (Round 109 生产态锚)', () => {
    expect(TEST_PERIOD_5MIN).toBe(false);
    expect(getLimitResetDescription()).toBe('4:00 AM');
  });

  it('UTC 4:00 AM 分界: 3:59 与 4:00 落不同窗口日', () => {
    // 2026-10-09 UTC 03:59 → 减 4h = 10-08 → "2026-10-08"
    expect(getLimitWindow(new Date('2026-10-09T03:59:00Z'))).toBe('2026-10-08');
    // 2026-10-09 UTC 04:00 → 减 4h = 10-09 00:00 → "2026-10-09"
    expect(getLimitWindow(new Date('2026-10-09T04:00:00Z'))).toBe('2026-10-09');
  });

  it('同日两时刻 → 同窗口', () => {
    expect(getLimitWindow(new Date('2026-10-09T04:00:00Z'))).toBe(getLimitWindow(new Date('2026-10-09T23:30:00Z')));
  });

  it('isWindowReset: null/异窗 true; 同窗 false', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    expect(isWindowReset(null, now)).toBe(true);
    expect(isWindowReset(undefined, now)).toBe(true);
    expect(isWindowReset('2026-10-08', now)).toBe(true); // 昨日窗
    expect(isWindowReset('2026-10-09', now)).toBe(false); // 同窗
  });
});
