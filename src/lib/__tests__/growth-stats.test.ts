/**
 * Tests for growth-stats pure aggregation (batch82-c)
 *
 * - 空输入 → 零值骨架 (诚实为零, 不装样)
 * - 单邀请: pending → K=0; completed → K=1
 * - 多邀请去重: 同 referrer 多行只计一个邀请者
 * - K 边界: completed ÷ uniqueInviters 两位小数舍入 (1/3→0.33, 2/3→0.67)
 * - rejected 行计入发出数, 不进完成/邀请者桶
 * - 红线: 输出序列化无任何个人字段 / 金额字段 (reward 50 代币不是钱)
 */

import { describe, it, expect } from 'vitest';
import {
  aggregateGrowthStats,
  emptyGrowthStats,
  type GrowthInvitationRow,
} from '../growth-stats';

const NOW = new Date('2026-09-19T00:00:00.000Z');

function row(referrer: string | null, status: string): GrowthInvitationRow {
  return { referrer_user_id: referrer, status };
}

describe('aggregateGrowthStats — empty inputs', () => {
  it('returns the zeroed skeleton for empty / null / undefined rows', () => {
    for (const rows of [[], null, undefined] as const) {
      const stats = aggregateGrowthStats(rows as GrowthInvitationRow[] | null | undefined, NOW);
      expect(stats).toEqual({
        invites: { total: 0, pending: 0, completed: 0 },
        uniqueInviters: 0,
        kFactorApprox: 0,
        generatedAt: NOW.toISOString(),
        degraded: false,
      });
    }
  });

  it('emptyGrowthStats satisfies the same key contract', () => {
    expect(Object.keys(emptyGrowthStats(NOW, true))).toEqual([
      'invites', 'uniqueInviters', 'kFactorApprox', 'generatedAt', 'degraded',
    ]);
  });
});

describe('aggregateGrowthStats — single invitation', () => {
  it('pending invite: counted as sent, K stays 0 (honest small numbers)', () => {
    const stats = aggregateGrowthStats([row('r1', 'pending')], NOW);
    expect(stats.invites).toEqual({ total: 1, pending: 1, completed: 0 });
    expect(stats.uniqueInviters).toBe(1);
    expect(stats.kFactorApprox).toBe(0);
  });

  it('completed invite: K = 1', () => {
    const stats = aggregateGrowthStats([row('r1', 'completed')], NOW);
    expect(stats.invites).toEqual({ total: 1, pending: 0, completed: 1 });
    expect(stats.uniqueInviters).toBe(1);
    expect(stats.kFactorApprox).toBe(1);
  });

  it('rejected invite: in total, out of pending/completed buckets', () => {
    const stats = aggregateGrowthStats([row('r1', 'rejected')], NOW);
    expect(stats.invites).toEqual({ total: 1, pending: 0, completed: 0 });
    expect(stats.uniqueInviters).toBe(1);
    expect(stats.kFactorApprox).toBe(0);
  });
});

describe('aggregateGrowthStats — dedup and K boundaries', () => {
  it('dedupes repeated referrers into one unique inviter', () => {
    const stats = aggregateGrowthStats(
      [
        row('r1', 'completed'),
        row('r1', 'completed'),
        row('r1', 'pending'),
        row('r2', 'completed'),
        row('r3', 'pending'),
      ],
      NOW,
    );
    expect(stats.invites).toEqual({ total: 5, pending: 2, completed: 3 });
    expect(stats.uniqueInviters).toBe(3);
    expect(stats.kFactorApprox).toBe(1); // 3 completed ÷ 3 inviters
  });

  it('rounds K to two decimals: 1/3 → 0.33, 2/3 → 0.67, 3/10 → 0.3', () => {
    const one = aggregateGrowthStats([row('r1', 'completed'), row('r2', 'pending'), row('r3', 'pending')], NOW);
    expect(one.kFactorApprox).toBe(0.33);
    const two = aggregateGrowthStats(
      [row('r1', 'completed'), row('r2', 'completed'), row('r3', 'pending')],
      NOW,
    );
    expect(two.kFactorApprox).toBe(0.67);
    // 3 completed ÷ 10 unique inviters — 0.3 显示 0.3, 不凑整不美化
    const rows: GrowthInvitationRow[] = [];
    for (let i = 0; i < 10; i++) rows.push(row(`r${i}`, i < 3 ? 'completed' : 'pending'));
    expect(aggregateGrowthStats(rows, NOW).kFactorApprox).toBe(0.3);
  });

  it('rows without a referrer count as sent but never inflate the denominator', () => {
    const stats = aggregateGrowthStats([row(null, 'completed'), row('r1', 'completed')], NOW);
    expect(stats.invites).toEqual({ total: 2, pending: 0, completed: 2 });
    expect(stats.uniqueInviters).toBe(1);
    expect(stats.kFactorApprox).toBe(2);
  });
});

describe('aggregateGrowthStats — red lines', () => {
  it('serialized output carries zero personal / amount fields', () => {
    const stats = aggregateGrowthStats([row('referrer-uuid', 'completed')], NOW);
    const raw = JSON.stringify(stats);
    expect(raw).not.toMatch(/user_id|referee|referrer|email/i);
    expect(raw).not.toMatch(/reward|amount|token/i);
  });
});
