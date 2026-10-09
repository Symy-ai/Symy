import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/dream-achievement', () => ({
  isDreamFundAchieved: vi.fn((fund: { current: number; target: number }) => fund.current >= fund.target),
}));
vi.mock('@/lib/freedom-time', () => ({
  DEFAULT_HOURLY_RATE: 50,
  moneyToHours: vi.fn((money: number, rate: number) => money / rate),
}));

import { calcBadgeProgress, isProgressTrackable } from '../badge-progress';

const fund = (id: string, current: number, target = 100) => ({ id, name: id, current, target, createdAt: '2026-01-01' });
const state = (over: Record<string, unknown>) => over as never;

/**
 * badge-progress.ts (42行) — 勋章进度计算 (纯函数)。
 *
 * 锁定:
 * - 九 progressType 分流: 数值直取/dream 三档过滤/won_back_hours floor 换算
 * - 无 buddyState → 0
 * - untrackable 双类型 (big_truth/clear_mind_streak) → 0 且 isProgressTrackable=false
 */
describe('isProgressTrackable', () => {
  it('big_truth/clear_mind_streak 不可追踪; 其余可', () => {
    expect(isProgressTrackable('big_truth')).toBe(false);
    expect(isProgressTrackable('clear_mind_streak')).toBe(false);
    expect(isProgressTrackable('challenge_wins')).toBe(true);
    expect(isProgressTrackable('won_back_hours')).toBe(true);
  });
});

describe('calcBadgeProgress 九分流', () => {
  it('数值四类直取 (|| 0 兜底)', () => {
    expect(calcBadgeProgress({ progressType: 'challenge_wins' } as never, state({ challengesCompleted: 7 }))).toBe(7);
    expect(calcBadgeProgress({ progressType: 'total_saves' } as never, state({ totalSaved: 1234 }))).toBe(1234);
    expect(calcBadgeProgress({ progressType: 'streak_days' } as never, state({ streak: 12 }))).toBe(12);
    expect(calcBadgeProgress({ progressType: 'invited_count' } as never, state({ invitedCount: 3 }))).toBe(3);
    // undefined 兜底 0
    expect(calcBadgeProgress({ progressType: 'streak_days' } as never, state({}))).toBe(0);
  });

  it('dream 三档: count/funded(>0)/completed(达标)', () => {
    const funds = [fund('a', 0), fund('b', 50), fund('c', 100)];
    const s = state({ dreamFunds: funds });
    expect(calcBadgeProgress({ progressType: 'dream_fund_count' } as never, s)).toBe(3);
    expect(calcBadgeProgress({ progressType: 'dream_fund_funded' } as never, s)).toBe(2); // b+c >0
    expect(calcBadgeProgress({ progressType: 'dream_fund_completed' } as never, s)).toBe(1); // 仅 c 达标
  });

  it('won_back_hours: floor 换算 (rate 可调)', () => {
    expect(calcBadgeProgress({ progressType: 'won_back_hours' } as never, state({ totalSaved: 1000 }))).toBe(20); // 默认 50
    expect(calcBadgeProgress({ progressType: 'won_back_hours' } as never, state({ totalSaved: 1000 }), 100)).toBe(10);
    expect(calcBadgeProgress({ progressType: 'won_back_hours' } as never, state({ totalSaved: 99 }), 50)).toBe(1); // floor(1.98)
  });

  it('无 buddyState / untrackable / 未知类型 → 0', () => {
    expect(calcBadgeProgress({ progressType: 'challenge_wins' } as never, null)).toBe(0);
    expect(calcBadgeProgress({ progressType: 'challenge_wins' } as never, undefined)).toBe(0);
    expect(calcBadgeProgress({ progressType: 'big_truth' } as never, state({ challengesCompleted: 99 }))).toBe(0);
    expect(calcBadgeProgress({ progressType: 'unknown_x' } as never, state({ streak: 5 }))).toBe(0);
  });
});
