/**
 * aggregateGuardMoments 测试 — 守护时刻时间线聚合 (batch58-a)
 *
 * 覆盖: 三类混合 (含月份分组/倒序/计数/天数/金额汇总)、样本不足 (空输入/
 * 全部无法归类 → empty)、乱序输入归位、triggerId 去重、无效 createdAt 跳过。
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateGuardMoments,
  type GuardMomentEventInput,
} from '../guard-moments';

describe('aggregateGuardMoments', () => {
  it('三类混合: 三类均出现, 计数/天数/金额汇总正确', () => {
    const events: GuardMomentEventInput[] = [
      { eventType: 'challenge_completed', triggerId: 'g1', metadata: { savedAmount: 120 }, createdAt: new Date(2026, 8, 7, 10).toISOString() },
      { eventType: 'mindful_recovery', triggerId: 'a1', metadata: { kind: 'green_alt_adoption', estSaved: 30 }, createdAt: new Date(2026, 8, 6, 9).toISOString() },
      { eventType: 'mindful_recovery', triggerId: 'r1', metadata: { kind: 'reuse_adoption', estSaved: 15 }, createdAt: new Date(2026, 7, 20, 15).toISOString() },
      { eventType: 'mindful_recovery', triggerId: 'x1', metadata: { kind: 'other' }, createdAt: new Date(2026, 8, 5).toISOString() },
      { eventType: 'challenge_failed', triggerId: 'f1', metadata: null, createdAt: new Date(2026, 8, 5).toISOString() },
    ];

    const tl = aggregateGuardMoments(events);
    expect(tl.status).toBe('ok');
    expect(tl.trackCounts).toEqual({ guard: 1, alt: 1, reuse: 1 });
    expect(tl.totalMoments).toBe(3);
    expect(tl.activeDays).toBe(3);
    expect(tl.totalSaved).toBe(165);
    // 跨月分组: 2026-09 (guard+alt) + 2026-08 (reuse), 月份倒序
    expect(tl.months.map((m) => m.monthKey)).toEqual(['2026-09', '2026-08']);
    expect(tl.months[0].moments.map((m) => m.track)).toEqual(['guard', 'alt']);
    expect(tl.months[1].moments.map((m) => m.track)).toEqual(['reuse']);
    // failed / 无 kind 的 recovery 不进时间线 (只庆祝胜利时刻)
  });

  it('样本不足: 空输入 / 全部无法归类 → empty 稳定降级', () => {
    expect(aggregateGuardMoments([]).status).toBe('empty');
    expect(aggregateGuardMoments(null).status).toBe('empty');
    const tl = aggregateGuardMoments([
      { eventType: 'challenge_failed', triggerId: 'f1', metadata: null, createdAt: new Date(2026, 8, 5).toISOString() },
      { eventType: 'mindful_recovery', triggerId: 'x1', metadata: null, createdAt: new Date(2026, 8, 5).toISOString() },
    ]);
    expect(tl.status).toBe('empty');
    expect(tl.totalMoments).toBe(0);
    expect(tl.months).toEqual([]);
  });

  it('乱序输入: 组内与月份均按时间倒序归位', () => {
    const events: GuardMomentEventInput[] = [
      { eventType: 'mindful_recovery', triggerId: 'r1', metadata: { kind: 'reuse_adoption' }, createdAt: new Date(2026, 6, 1).toISOString() },
      { eventType: 'challenge_completed', triggerId: 'g2', metadata: null, createdAt: new Date(2026, 8, 8).toISOString() },
      { eventType: 'challenge_completed', triggerId: 'g1', metadata: null, createdAt: new Date(2026, 8, 3).toISOString() },
      { eventType: 'mindful_recovery', triggerId: 'a1', metadata: { kind: 'green_alt_adoption' }, createdAt: new Date(2026, 8, 15).toISOString() },
    ];

    const tl = aggregateGuardMoments(events);
    expect(tl.months.map((m) => m.monthKey)).toEqual(['2026-09', '2026-07']);
    expect(tl.months[0].moments.map((m) => m.id)).toEqual(['a1', 'g2', 'g1']);
    expect(tl.months[1].moments.map((m) => m.id)).toEqual(['r1']);
  });

  it('triggerId 去重 + 无效 createdAt 跳过', () => {
    const events: GuardMomentEventInput[] = [
      { eventType: 'challenge_completed', triggerId: 'g1', metadata: { savedAmount: 50 }, createdAt: new Date(2026, 8, 1).toISOString() },
      { eventType: 'challenge_completed', triggerId: 'g1', metadata: { savedAmount: 50 }, createdAt: new Date(2026, 8, 2).toISOString() },
      { eventType: 'challenge_completed', triggerId: 'g2', metadata: null, createdAt: 'not-a-date' },
      { eventType: 'mindful_recovery', triggerId: null, metadata: { kind: 'reuse_adoption', estSaved: 5 }, createdAt: new Date(2026, 8, 3).toISOString() },
    ];

    const tl = aggregateGuardMoments(events);
    expect(tl.totalMoments).toBe(2);
    expect(tl.totalSaved).toBe(55);
    // 无 triggerId 的条目用 track-timestamp 兜底 id
    expect(tl.months[0].moments.some((m) => m.id.startsWith('reuse-'))).toBe(true);
  });

  it('同日多条只计 1 个活跃天; 金额无效 (0/负/非数) 不进汇总', () => {
    const events: GuardMomentEventInput[] = [
      { eventType: 'challenge_completed', triggerId: 'g1', metadata: { savedAmount: 0 }, createdAt: new Date(2026, 8, 1, 8).toISOString() },
      { eventType: 'mindful_recovery', triggerId: 'a1', metadata: { kind: 'green_alt_adoption', estSaved: -3 }, createdAt: new Date(2026, 8, 1, 20).toISOString() },
      { eventType: 'mindful_recovery', triggerId: 'r1', metadata: { kind: 'reuse_adoption', estSaved: 'oops' }, createdAt: new Date(2026, 8, 1, 21).toISOString() },
    ];

    const tl = aggregateGuardMoments(events);
    expect(tl.totalMoments).toBe(3);
    expect(tl.activeDays).toBe(1);
    expect(tl.totalSaved).toBe(0);
  });
});
