import { describe, expect, it } from 'vitest';

import { isDreamFundAchieved } from '../dream-achievement';

const fund = (over: Partial<{ id: string; target: number; current: number }>) =>
  ({ id: 'f1', name: 'X', current: 0, target: 100, createdAt: '2026-01-01', ...over }) as never;

/**
 * dream-achievement.ts (5行) — 梦想达标判定 (lib 源)。
 *
 * 锁定:
 * - 达标: current >= target 且 target > 0
 * - savings 特殊基金永不达标
 * - target<=0 → false (防零除/永真)
 */
describe('isDreamFundAchieved', () => {
  it('达标/未达标', () => {
    expect(isDreamFundAchieved(fund({ current: 100 }))).toBe(true);
    expect(isDreamFundAchieved(fund({ current: 150 }))).toBe(true); // 超额也算
    expect(isDreamFundAchieved(fund({ current: 99 }))).toBe(false);
    expect(isDreamFundAchieved(fund({ current: 0 }))).toBe(false);
  });

  it('savings 特殊基金永不达标', () => {
    expect(isDreamFundAchieved(fund({ id: 'savings', current: 999999, target: 100 }))).toBe(false);
  });

  it('target<=0 → false', () => {
    expect(isDreamFundAchieved(fund({ target: 0, current: 0 }))).toBe(false);
    expect(isDreamFundAchieved(fund({ target: -5, current: 10 }))).toBe(false);
  });
});
