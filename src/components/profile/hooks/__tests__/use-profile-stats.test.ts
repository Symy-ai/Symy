// @vitest-environment happy-dom
/**
 * batch76-b — components/profile/hooks/use-profile-stats.ts 现状固化
 * （batch75 第一段未落地遗留；testgap v3 §五 快速可补条目，BUG-5/6/7 前科文件）
 *
 * 核心口径（BUG-7 修复后）：
 *   moneySaved = Σ refunded receipts + Σ dreamFunds.current
 *   （dreamFunds 缺失或空数组 → 回退 buddyTotalSaved）
 *   impulseInterventions = buddyChallengesCompleted + refunded 收据数（PM5-P2-2 语义）
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProfileStats } from '@/components/profile/hooks/use-profile-stats';
import type { EmailReceipt } from '@/lib/supabase';

function receipt(overrides: Partial<EmailReceipt>): EmailReceipt {
  return {
    id: 'r1',
    user_id: 'u1',
    connection_id: 'c1',
    message_id: 'm1',
    from_address: 'a@b.c',
    subject: 's',
    snippet: '',
    platform: 'amazon',
    currency: 'USD',
    received_at: '2026-09-01T00:00:00Z',
    impulse_score: 0,
    status: 'actionable',
    ...overrides,
  } as EmailReceipt;
}

describe('useProfileStats', () => {
  it('empty inputs → all-zero stats', () => {
    const { result } = renderHook(() => useProfileStats({ uniqueReceipts: [] }));
    expect(result.current).toEqual({ impulseInterventions: 0, moneySaved: 0, daysStreak: 0 });
  });

  it('BUG-7 口径: moneySaved = Σ refunded + Σ dreamFunds.current（totalSaved 不再参与）', () => {
    const { result } = renderHook(() =>
      useProfileStats({
        uniqueReceipts: [
          receipt({ id: 'r1', status: 'refunded', amount: 12.5 }),
          receipt({ id: 'r2', status: 'detected', amount: 30 }), // 未退款不计
          receipt({ id: 'r3', status: 'refunded', amount: 8 }),
        ],
        buddyStreak: 7,
        buddyChallengesCompleted: 3,
        buddyDreamFunds: [
          { current: 100, target: 200 },
          { current: 50.5, target: 100 },
        ],
      }),
    );
    expect(result.current.moneySaved).toBeCloseTo(20.5 + 150.5, 10);
    expect(result.current.impulseInterventions).toBe(5); // 3 challenges + 2 refunded
    expect(result.current.daysStreak).toBe(7);
  });

  it('dreamFunds undefined → fallback buddyTotalSaved（向后兼容）', () => {
    const { result } = renderHook(() =>
      useProfileStats({
        uniqueReceipts: [receipt({ status: 'refunded', amount: 10 })],
        buddyTotalSaved: 222,
      }),
    );
    expect(result.current.moneySaved).toBe(232);
  });

  it('dreamFunds 空数组 → 同样回退 buddyTotalSaved（length>0 判定）', () => {
    const { result } = renderHook(() =>
      useProfileStats({
        uniqueReceipts: [],
        buddyTotalSaved: 222,
        buddyDreamFunds: [],
      }),
    );
    expect(result.current.moneySaved).toBe(222);
  });

  it('null amount / null fund.current 按 0 计，不产生 NaN', () => {
    const { result } = renderHook(() =>
      useProfileStats({
        uniqueReceipts: [receipt({ status: 'refunded', amount: undefined as unknown as number })],
        buddyDreamFunds: [{ current: undefined as unknown as number, target: 100 }],
      }),
    );
    expect(result.current.moneySaved).toBe(0);
    expect(Number.isNaN(result.current.moneySaved)).toBe(false);
  });

  it('buddyStreak/buddyChallengesCompleted 缺失 → 0 兜底', () => {
    const { result } = renderHook(() =>
      useProfileStats({ uniqueReceipts: [receipt({ status: 'refunded', amount: 5 })] }),
    );
    expect(result.current.daysStreak).toBe(0);
    expect(result.current.impulseInterventions).toBe(1);
  });
});
