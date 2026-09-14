/**
 * weeklyGuardCompare 纯函数测试 (batch50-c)
 * 周界切分 (本地周一)/趋势判定 (含相等→持平)/空数据降级/去重/时薪换算。
 */

import { describe, it, expect } from 'vitest';
import { localWeekStart, weeklyGuardCompare, type WeeklyGuardEventInput } from '../weekly-guard-compare';

let seq = 0;
function ev(
  eventType: 'challenge_completed' | 'challenge_failed' | 'challenge_reward',
  date: Date,
  overrides: Partial<WeeklyGuardEventInput> = {},
): WeeklyGuardEventInput {
  seq += 1;
  return {
    eventType,
    triggerSource: eventType === 'challenge_reward' ? 'deposit_api' : 'chat_mcp',
    triggerId: `${eventType}:${seq}`,
    metadata: eventType === 'challenge_reward' ? { source: 'deposit', amount: 25 } : null,
    createdAt: date.toISOString(),
    ...overrides,
  };
}

/** 2026-09-08 周二 12:00 (本地) — 本周起点 2026-09-07 周一, 上周起点 2026-08-31 */
const NOW = new Date(2026, 8, 8, 12);

describe('localWeekStart', () => {
  it('returns Monday of the current local week', () => {
    const start = localWeekStart(new Date(2026, 8, 8, 12)); // 周二
    expect(start.getDay()).toBe(1);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(8);
    expect(start.getDate()).toBe(7);
  });

  it('handles Sunday as last day of the week (not next Monday)', () => {
    const start = localWeekStart(new Date(2026, 8, 6, 12)); // 周日
    expect(start.getDate()).toBe(31); // 2026-08-31 周一
    expect(start.getMonth()).toBe(7);
  });

  it('crosses year boundary correctly', () => {
    const start = localWeekStart(new Date(2027, 0, 1, 12)); // 2027-01-01 周五
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(11);
    expect(start.getDate()).toBe(28); // 2026-12-28 周一
  });
});

describe('weeklyGuardCompare', () => {
  it('splits events into this week / last week; older history ignored', () => {
    const result = weeklyGuardCompare([
      ev('challenge_completed', new Date(2026, 8, 7, 9)), // 本周一
      ev('challenge_completed', new Date(2026, 8, 5, 9)), // 上周四
      ev('challenge_completed', new Date(2026, 8, 3, 9)), // 上周二
      ev('challenge_failed', new Date(2026, 7, 30, 9)), // 更早 → 忽略
    ], NOW);

    expect(result.status).toBe('ok');
    expect(result.thisWeek.intercepts).toBe(1);
    expect(result.lastWeek.intercepts).toBe(2);
  });

  it('equal metrics trend flat (never up/down on ties)', () => {
    const result = weeklyGuardCompare([
      ev('challenge_completed', new Date(2026, 8, 7, 9)),
      ev('challenge_reward', new Date(2026, 8, 7, 10)),
      ev('challenge_completed', new Date(2026, 8, 1, 9)),
      ev('challenge_reward', new Date(2026, 8, 1, 10)),
    ], NOW);

    expect(result.trends.intercepts).toBe('flat');
    expect(result.trends.passRate).toBe('flat');
    expect(result.trends.hoursReclaimed).toBe('flat');
  });

  it('detects up/down trends per metric', () => {
    const result = weeklyGuardCompare([
      // 本周: 2 局 1 胜, 存 50
      ev('challenge_completed', new Date(2026, 8, 7, 9)),
      ev('challenge_failed', new Date(2026, 8, 8, 9)),
      ev('challenge_reward', new Date(2026, 8, 7, 10), { metadata: { source: 'deposit', amount: 50 } }),
      // 上周: 3 局 1 胜, 存 100
      ev('challenge_completed', new Date(2026, 8, 1, 9)),
      ev('challenge_failed', new Date(2026, 8, 2, 9)),
      ev('challenge_failed', new Date(2026, 8, 3, 9)),
      ev('challenge_reward', new Date(2026, 8, 1, 10), { metadata: { source: 'deposit', amount: 100 } }),
    ], NOW);

    expect(result.trends.intercepts).toBe('down');
    expect(result.trends.passRate).toBe('up'); // 1/2 > 1/3
    expect(result.trends.hoursReclaimed).toBe('down');
  });

  it('no baseline: last week has no data → guide state, no negative trends', () => {
    const result = weeklyGuardCompare([
      ev('challenge_completed', new Date(2026, 8, 7, 9)),
      ev('challenge_failed', new Date(2026, 8, 8, 9)),
    ], NOW);

    expect(result.status).toBe('noBaseline');
    expect(result.trends).toEqual({ intercepts: 'flat', passRate: 'flat', hoursReclaimed: 'flat' });
    expect(result.thisWeek.intercepts).toBe(2);
    expect(result.thisWeek.passRate).toBe(0.5);
  });

  it('last week deposit-only still counts as baseline data', () => {
    const result = weeklyGuardCompare([
      ev('challenge_reward', new Date(2026, 8, 1, 10)),
      ev('challenge_reward', new Date(2026, 8, 7, 10)),
    ], NOW);
    expect(result.status).toBe('ok');
    expect(result.lastWeek.passRate).toBeNull();
    expect(result.trends.passRate).toBe('flat'); // 双方无结论 → 持平
  });

  it('passRate is null (not 0) for a week with zero settled rounds', () => {
    const result = weeklyGuardCompare([
      ev('challenge_reward', new Date(2026, 8, 1, 10)),
      ev('challenge_completed', new Date(2026, 8, 7, 9)),
    ], NOW);
    expect(result.lastWeek.passRate).toBeNull();
    expect(result.thisWeek.passRate).toBe(1);
  });

  it('dedups repeated events by triggerId per category', () => {
    const dup = ev('challenge_completed', new Date(2026, 8, 1, 9));
    const dupReward = ev('challenge_reward', new Date(2026, 8, 1, 10));
    const result = weeklyGuardCompare([
      dup, dup, dupReward, dupReward,
      ev('challenge_completed', new Date(2026, 8, 7, 9)),
    ], NOW);
    expect(result.lastWeek.intercepts).toBe(1);
    expect(result.lastWeek.guardedAmount).toBe(25);
  });

  it('converts guarded amount to hours via hourly rate (default $25)', () => {
    const result = weeklyGuardCompare([
      ev('challenge_reward', new Date(2026, 8, 1, 10), { metadata: { source: 'deposit', amount: 50 } }),
      ev('challenge_reward', new Date(2026, 8, 7, 10), { metadata: { source: 'deposit', amount: 75 } }),
    ], NOW);
    expect(result.lastWeek.hoursReclaimed).toBe(2);
    expect(result.thisWeek.hoursReclaimed).toBe(3);

    const custom = weeklyGuardCompare([
      ev('challenge_reward', new Date(2026, 8, 1, 10), { metadata: { source: 'deposit', amount: 50 } }),
      ev('challenge_reward', new Date(2026, 8, 7, 10), { metadata: { source: 'deposit', amount: 50 } }),
    ], NOW, 50);
    expect(custom.thisWeek.hoursReclaimed).toBe(1);
  });

  it('skips invalid createdAt and non-deposit rewards', () => {
    const result = weeklyGuardCompare([
      { eventType: 'challenge_completed', triggerSource: 'chat_mcp', triggerId: 'x', metadata: null, createdAt: 'not-a-date' },
      ev('challenge_reward', new Date(2026, 8, 1, 10), { triggerSource: 'other', metadata: { source: 'deposit', amount: 50 } }),
      ev('challenge_completed', new Date(2026, 8, 7, 9)),
    ], NOW);
    expect(result.status).toBe('noBaseline');
    expect(result.lastWeek.guardedAmount).toBe(0);
  });

  it('empty/null events degrade to noBaseline', () => {
    expect(weeklyGuardCompare([], NOW).status).toBe('noBaseline');
    expect(weeklyGuardCompare(null, NOW).status).toBe('noBaseline');
  });
});
