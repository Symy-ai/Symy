// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/dream-achievement', () => ({
  isDreamFundAchieved: vi.fn((fund: { current: number; target: number }) => fund.current >= fund.target),
}));

import {
  DREAM_ACHIEVEMENT_PREFIX,
  claimDreamAchievement,
  dreamAchievementKey,
  markDreamBaseline,
  readDreamAchievement,
  resetDreamAchievement,
  resolveDreamAchievement,
} from '../dream-achievement';

const fund = (id: string, current: number, target = 100) => ({ id, name: id, current, target, createdAt: '2026-01-01' }) as never;

/**
 * dream-achievement.ts (55行) — 梦想基金成就 localStorage 门卫。
 *
 * 锁定:
 * - key 前缀律 symy-dream-achieved:{id}
 * - claim/baseline/read 三态 ('1'/'unachieved'/坏值→null); reset 清除
 * - resolveDreamAchievement: 首次达标未领 → 最大者; 全已领/无达标 → null
 * - localStorage 抛错 → 静默降级 (privacy mode)
 */
describe('dream-achievement localStorage 门卫', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('key 前缀律', () => {
    expect(dreamAchievementKey('f1')).toBe(`${DREAM_ACHIEVEMENT_PREFIX}f1`);
  });

  it('claim → read=1; baseline → read=unachieved; 坏值 → null; reset → null', () => {
    claimDreamAchievement('f1');
    expect(readDreamAchievement('f1')).toBe('1');
    markDreamBaseline('f2');
    expect(readDreamAchievement('f2')).toBe('unachieved');
    window.localStorage.setItem(dreamAchievementKey('f3'), 'garbage');
    expect(readDreamAchievement('f3')).toBeNull();
    resetDreamAchievement('f1');
    expect(readDreamAchievement('f1')).toBeNull();
  });

  it('resolve: 首次达标未领 → 最大者; 全已领/无达标 → null', () => {
    const achieved1 = fund('a', 100);
    const achieved2 = fund('b', 300);
    const notYet = fund('c', 40);
    const winner = resolveDreamAchievement([achieved1, achieved2, notYet], () => false);
    expect((winner as { id: string }).id).toBe('b'); // 最大优先
    expect(resolveDreamAchievement([achieved1], () => true)).toBeNull(); // 全已领
    expect(resolveDreamAchievement([notYet], () => false)).toBeNull(); // 无达标
    expect(resolveDreamAchievement([], () => false)).toBeNull();
  });

  it('localStorage 抛错 → 静默降级', () => {
    const boom = vi.fn(() => {
      throw new Error('privacy');
    });
    Object.defineProperty(window, 'localStorage', { value: { getItem: boom, setItem: boom, removeItem: boom }, configurable: true });
    expect(() => claimDreamAchievement('x')).not.toThrow();
    expect(() => markDreamBaseline('x')).not.toThrow();
    expect(() => resetDreamAchievement('x')).not.toThrow();
    expect(readDreamAchievement('x')).toBeNull();
  });
});
