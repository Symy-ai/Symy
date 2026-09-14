// @vitest-environment node

/**
 * Monthly Guard Statement — 纯函数测试 (batch54-b)
 *
 * 覆盖: 自然月边界 (跨月事件各归各月) / 空月与非法 monthKey 降级 /
 * 对比行方向与 noBaseline / 品类聚合与 resolveGuardCategory 对齐 /
 * 最长连胜 / 绿色替代采纳约定 / 金额只出现在 private 字段
 * (public 结构 JSON 序列化后无金额 — 类型层面分离的行为断言) /
 * 时薪非法回落共享通道默认 $25 (不出现第二套默认值)。
 */

import { describe, it, expect } from 'vitest';
import {
  buildMonthlyStatement,
  type MonthlyGuardEventInput,
} from '@/lib/monthly-guard-statement';
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';

function completed(dayIso: string, extra: Partial<MonthlyGuardEventInput> = {}): MonthlyGuardEventInput {
  return { eventType: 'challenge_completed', triggerSource: 'guard', triggerId: `c-${dayIso}-${extra.triggerId ?? Math.random()}`, createdAt: dayIso, ...extra };
}

function failed(dayIso: string, extra: Partial<MonthlyGuardEventInput> = {}): MonthlyGuardEventInput {
  return { eventType: 'challenge_failed', triggerSource: 'guard', triggerId: `f-${dayIso}-${extra.triggerId ?? Math.random()}`, createdAt: dayIso, ...extra };
}

function deposit(dayIso: string, amount: number, extra: Partial<MonthlyGuardEventInput> = {}): MonthlyGuardEventInput {
  return {
    eventType: 'challenge_reward',
    triggerSource: 'deposit_api',
    triggerId: `d-${dayIso}-${amount}-${extra.triggerId ?? Math.random()}`,
    metadata: { source: 'deposit', amount },
    createdAt: dayIso,
    ...extra,
  };
}

function adoption(dayIso: string, entryId: string): MonthlyGuardEventInput {
  return {
    eventType: 'mindful_recovery',
    triggerSource: 'chat_mcp',
    triggerId: `green-alt-adoption:${entryId}:${dayIso.slice(0, 10)}`,
    metadata: { kind: 'green_alt_adoption', entryId },
    createdAt: dayIso,
  };
}

describe('buildMonthlyStatement', () => {
  it('aggregates intercept structure + hours via shared hourly-rate channel', () => {
    const events = [
      completed('2026-09-01T10:00:00'),
      completed('2026-09-02T10:00:00'),
      failed('2026-09-03T10:00:00'),
      deposit('2026-09-02T11:00:00', 100),
      deposit('2026-09-03T11:00:00', 50),
    ];
    const r = buildMonthlyStatement(events, { monthKey: '2026-09', hourlyRate: 25, locale: 'zh' });
    expect(r.status).toBe('ok');
    expect(r.public.intercepts).toBe(3);
    expect(r.public.passed).toBe(2);
    expect(r.public.abandoned).toBe(1);
    expect(r.public.passRate).toBeCloseTo(2 / 3);
    expect(r.private.guardedAmount).toBe(150);
    expect(r.public.hoursReclaimed).toBeCloseTo(6);
    expect(r.public.hoursLabel).toBe('6.0 小时');
    // 金额红线: public 结构序列化后无任何金额数字泄漏
    expect(JSON.stringify(r.public)).not.toContain('150');
    expect(Object.keys(r.public)).not.toContain('guardedAmount');
    expect(Object.keys(r.private)).toContain('guardedAmount');
  });

  it('natural-month boundaries: cross-month events each land in their own month', () => {
    const events = [
      completed('2026-08-31T23:59:59'),
      completed('2026-09-01T00:00:00'),
      completed('2026-09-30T23:59:59'),
      completed('2026-10-01T00:00:00'),
    ];
    const r = buildMonthlyStatement(events, { monthKey: '2026-09' });
    expect(r.public.intercepts).toBe(2);
    const aug = buildMonthlyStatement(events, { monthKey: '2026-08' });
    expect(aug.public.intercepts).toBe(1);
    expect(aug.public.compare.status).toBe('noBaseline');
  });

  it('empty month and invalid monthKey degrade to noData with stable shape', () => {
    const empty = buildMonthlyStatement([completed('2026-08-05T10:00:00')], { monthKey: '2026-09' });
    expect(empty.status).toBe('noData');
    expect(empty.public.intercepts).toBe(0);
    expect(empty.public.compare.status).toBe('noBaseline');

    const invalid = buildMonthlyStatement([completed('2026-09-05T10:00:00')], { monthKey: 'not-a-month' });
    expect(invalid.status).toBe('noData');
    expect(invalid.monthKey).toBe('not-a-month');
  });

  it('compare row: up/down directions and noBaseline when last month has no data', () => {
    const events = [
      completed('2026-08-05T10:00:00'),
      completed('2026-09-05T10:00:00'),
      completed('2026-09-06T10:00:00'),
    ];
    const r = buildMonthlyStatement(events, { monthKey: '2026-09' });
    expect(r.public.compare.status).toBe('ok');
    expect(r.public.compare.intercepts).toBe('up');
    expect(r.public.compare.prevIntercepts).toBe(1);

    const down = buildMonthlyStatement(
      [completed('2026-08-01T10:00:00'), completed('2026-08-02T10:00:00'), completed('2026-09-05T10:00:00')],
      { monthKey: '2026-09' },
    );
    expect(down.public.compare.intercepts).toBe('down');
  });

  it('category top3 aligns with resolveGuardCategory (metadata.category + itemTitle derivation)', () => {
    const events = [
      completed('2026-09-01T10:00:00', { metadata: { category: 'clothing', amount: 30 } }),
      completed('2026-09-02T10:00:00', { metadata: { category: 'clothing', amount: 30 } }),
      completed('2026-09-03T10:00:00', { metadata: { itemTitle: 'new headphones' } }), // → electronics via title derivation
      completed('2026-09-04T10:00:00', { metadata: {} }), // → other, excluded from top3
      deposit('2026-09-05T10:00:00', 60, { metadata: { source: 'deposit', amount: 60, category: 'beauty' } }),
    ];
    const r = buildMonthlyStatement(events, { monthKey: '2026-09' });
    expect(r.public.topCategories.map((c) => c.category)).toEqual(['clothing', 'beauty', 'electronics']);
    expect(r.public.topCategories[0].count).toBe(2);
  });

  it('longest streak counts max consecutive winning days, reset by a failed day', () => {
    const events = [
      completed('2026-09-01T10:00:00'),
      completed('2026-09-02T10:00:00'),
      completed('2026-09-03T10:00:00'),
      failed('2026-09-04T10:00:00'),
      completed('2026-09-05T10:00:00'),
      completed('2026-09-06T10:00:00'),
      completed('2026-09-08T10:00:00'), // 断档后单日
    ];
    const r = buildMonthlyStatement(events, { monthKey: '2026-09' });
    expect(r.public.longestStreakDays).toBe(3); // 1-3 连胜; 4 有 failed; 5-6 两连; 8 单日
  });

  it('green-alt adoptions follow the green-alt-adoption ledger convention', () => {
    const events = [
      adoption('2026-09-01T10:00:00', 'secondhand-book-gift'),
      adoption('2026-09-01T10:00:00', 'secondhand-book-gift'), // 同 triggerId 幂等去重
      adoption('2026-09-02T10:00:00', 'handmade-gift'),
      {
        eventType: 'mindful_recovery',
        triggerSource: 'chat_mcp',
        triggerId: 'other-recovery:x',
        metadata: { kind: 'green_alt_adoption' },
        createdAt: '2026-09-03T10:00:00',
      }, // 非约定前缀 → 不计
    ];
    const r = buildMonthlyStatement(events, { monthKey: '2026-09' });
    expect(r.public.greenAltAdoptions).toBe(2);
  });

  it('hourly rate falls back to the shared DEFAULT_HOURLY_RATE — no second default', () => {
    const events = [deposit('2026-09-05T10:00:00', DEFAULT_HOURLY_RATE * 2)];
    const withJunk = buildMonthlyStatement(events, { monthKey: '2026-09', hourlyRate: Number.NaN });
    expect(withJunk.public.hoursReclaimed).toBeCloseTo(2);
    const withZero = buildMonthlyStatement(events, { monthKey: '2026-09', hourlyRate: 0 });
    expect(withZero.public.hoursReclaimed).toBeCloseTo(2);
  });

  it('tone tiers: harvest >= 10 intercepts, steady >= 3, starting below', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => completed(`2026-09-${String(i + 1).padStart(2, '0')}T10:00:00`));
    expect(buildMonthlyStatement(mk(10), { monthKey: '2026-09' }).public.tone).toBe('harvest');
    expect(buildMonthlyStatement(mk(3), { monthKey: '2026-09' }).public.tone).toBe('steady');
    expect(buildMonthlyStatement(mk(2), { monthKey: '2026-09' }).public.tone).toBe('starting');
  });
});
