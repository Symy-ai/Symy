/**
 * MCP Handler Tests — add_dream_fund_progress integration tests
 *
 * 🔧 2026-07-21 audit (agent-6 P1): 该 handler 让 AI 直接写梦想基金进度 (钱), 此前零覆盖。
 *   覆盖关键路径: 金额校验 (≤0/NaN)、auto 基金选择、in-memory 锁去重、显式 fund_id。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
/* eslint-disable require-await -- test mocks use async for API consistency */

vi.mock('@/lib/mcp-tools/handlers/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mcp-tools/handlers/_shared')>();
  return {
    ...actual,
    isToolCallInProgress: vi.fn(() => false),
    releaseToolCallLock: vi.fn(),
    isDuplicateHealthEvent: vi.fn(async () => false),
    applyBuddyStateDelta: vi.fn(async () => ({
      success: true, tokens: 10, vitality: 50, level: 1, xp: 0, xpToNext: 100,
      streak: 0, totalSaved: 0, challengesCompleted: 0, badges: [], dreamFunds: [], error: null,
    })),
    getUserLocale: vi.fn(async () => 'en'),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    deltaRpcHealth: { shouldTry: vi.fn(() => true), markAvailable: vi.fn(), markFailed: vi.fn(), reset: vi.fn() },
  };
});

vi.mock('@/lib/health-impact', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/health-impact')>();
  return { ...actual, createHealthEvent: vi.fn(async () => ({ success: true, eventId: 'evt-1' })) };
});

vi.mock('@/lib/user-hourly-rate', () => ({ getUserHourlyRate: vi.fn(async () => 20) }));

import { handleAddDreamFundProgress } from '../add_dream_fund_progress';
import { isToolCallInProgress, applyBuddyStateDelta, isDuplicateHealthEvent, logger } from '../_shared';
import { createHealthEvent } from '@/lib/health-impact';

// dream_funds rows returned by the handler's lookup query.
let mockFunds: Array<{ fund_id: string; name: string; target: number; current: number; emoji: string; sort_order: number; created_at: string }> = [];

function makeCtx(args: Record<string, unknown>, overrides: { userId?: string; toolCallId?: string } = {}) {
  // Chainable generic query (for active_challenges / health_events lookups) → empty.
  const emptyChain = {
    select: vi.fn(() => emptyChain),
    eq: vi.fn(() => emptyChain),
    order: vi.fn(() => emptyChain),
    gte: vi.fn(() => emptyChain),
    limit: vi.fn(async () => ({ data: [], error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
  };
  return {
    toolCallId: overrides.toolCallId || 'call-1',
    args,
    userId: overrides.userId || 'user-1',
    supabase: {
      rpc: vi.fn(async () => ({ data: { success: true }, error: null })),
      from: vi.fn((table: string) => {
        if (table === 'dream_funds') {
          // dream_funds query: .select().eq().order().order() then awaited → { data: funds }
          const fundChain = {
            select: vi.fn(() => fundChain),
            eq: vi.fn(() => fundChain),
            order: vi.fn(() => fundChain),
            then: (resolve: (v: unknown) => void) => resolve({ data: mockFunds, error: null }),
          };
          return fundChain;
        }
        return emptyChain;
      }),
    },
  };
}

describe('handleAddDreamFundProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isToolCallInProgress as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockFunds = [
      { fund_id: 'fund-trip', name: 'Trip', target: 1000, current: 100, emoji: '✈️', sort_order: 0, created_at: '2026-01-01' },
      { fund_id: 'fund-done', name: 'Done', target: 500, current: 500, emoji: '✅', sort_order: 1, created_at: '2026-01-02' },
    ];
  });

  it('rejects amount ≤ 0 and asks AI to retry', async () => {
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 0 }));
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/amount must be > 0/i);
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('rejects NaN / non-numeric amount', async () => {
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 'not-a-number' }));
    expect(res.success).toBe(false);
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('auto-selects the first INCOMPLETE fund when fund_id="auto"', async () => {
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 50 }));
    expect(res.success).toBe(true);
    // 'fund-done' is complete (current=target); 'fund-trip' is incomplete → must pick fund-trip.
    const deltaCallArgs = (applyBuddyStateDelta as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] ?? {};
    expect(deltaCallArgs).toMatchObject({ dreamFundId: 'fund-trip' });
  });

  it('uses explicit fund_id when provided and skips auto-select', async () => {
    const res = await handleAddDreamFundProgress(makeCtx({ fund_id: 'fund-done', amount: 25 }));
    expect(res.success).toBe(true);
    const deltaCallArgs = (applyBuddyStateDelta as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] ?? {};
    expect(deltaCallArgs).toMatchObject({ dreamFundId: 'fund-done' });
  });

  it('skips as success when in-memory lock is held (idempotent dedup)', async () => {
    (isToolCallInProgress as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 50 }));
    expect(res.success).toBe(true);
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('passes the positive amount through to applyBuddyStateDelta (dreamFundAmount + totalSavedDelta)', async () => {
    await handleAddDreamFundProgress(makeCtx({ amount: 89 }));
    const deltaCallArgs = (applyBuddyStateDelta as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] ?? {};
    expect(deltaCallArgs).toMatchObject({ dreamFundAmount: 89, totalSavedDelta: 89 });
  });
});

describe('E5 fixes (wool v8 §十四.3) — 幻觉金额上限 / 脏行徽章 / 分位 dedup key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isToolCallInProgress as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockFunds = [
      { fund_id: 'fund-trip', name: 'Trip', target: 1000, current: 100, emoji: '✈️', sort_order: 0, created_at: '2026-01-01' },
      { fund_id: 'fund-done', name: 'Done', target: 500, current: 500, emoji: '✅', sort_order: 1, created_at: '2026-01-02' },
    ];
  });

  it('rejects hallucinated amount 1e308 above the $1M cap (no totalSaved pollution)', async () => {
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 1e308 }));
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/exceeds the maximum/i);
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('exceeds cap'));
  });

  it('accepts amount exactly at the $1M cap (aligned with zod .max semantics)', async () => {
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 1_000_000 }));
    expect(res.success).toBe(true);
    expect(applyBuddyStateDelta).toHaveBeenCalled();
  });

  it('does NOT award dream_builder for dirty row {current:-5, target:0} (old code: Infinity ≥ 50)', async () => {
    mockFunds = [{ fund_id: 'fund-dirty', name: 'Dirty', target: 0, current: -5, emoji: '💥', sort_order: 0, created_at: '2026-01-03' }];
    const res = await handleAddDreamFundProgress(makeCtx({ fund_id: 'fund-dirty', amount: 89 }));
    expect(res.success).toBe(true);
    const deltaCallArgs = (applyBuddyStateDelta as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] ?? {};
    expect(deltaCallArgs).toMatchObject({ dreamFundId: 'fund-dirty', dreamFundAmount: 89, totalSavedDelta: 89, addBadges: [] });
  });

  it('does NOT award dream_builder for dirty row {current:-5, target:100} (old code: 84 ≥ 50)', async () => {
    mockFunds = [{ fund_id: 'fund-neg', name: 'Neg', target: 100, current: -5, emoji: '🕳️', sort_order: 0, created_at: '2026-01-04' }];
    const res = await handleAddDreamFundProgress(makeCtx({ fund_id: 'fund-neg', amount: 89 }));
    expect(res.success).toBe(true);
    const deltaCallArgs = (applyBuddyStateDelta as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] ?? {};
    expect(deltaCallArgs).toMatchObject({ addBadges: [] });
  });

  it('still awards dream_builder for a clean fund at ≥50% progress (normal path unchanged)', async () => {
    mockFunds = [{ fund_id: 'fund-half', name: 'Half', target: 100, current: 60, emoji: '🌱', sort_order: 0, created_at: '2026-01-05' }];
    const res = await handleAddDreamFundProgress(makeCtx({ fund_id: 'fund-half', amount: 10 }));
    expect(res.success).toBe(true);
    // (60+10)/100 = 70% ≥ 50 → badge; 旧路径行为不回退
    const deltaCallArgs = (applyBuddyStateDelta as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] ?? {};
    expect(deltaCallArgs).toMatchObject({ addBadges: ['dream_builder'] });
  });

  it('dedup key canonicalizes amount: 89 and "89.00" share one key (no float string)', async () => {
    await handleAddDreamFundProgress(makeCtx({ amount: 89 }));
    await handleAddDreamFundProgress(makeCtx({ amount: '89.00' }));
    const keys = (isDuplicateHealthEvent as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[1]));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toBe('dfp:user-1:fund-trip:89');
  });

  it('dedup key survives float noise: 0.1+0.2 and 0.3 converge (old code diverged → double deposit)', async () => {
    await handleAddDreamFundProgress(makeCtx({ amount: 0.1 + 0.2 }));
    await handleAddDreamFundProgress(makeCtx({ amount: 0.3 }));
    const calls = (isDuplicateHealthEvent as ReturnType<typeof vi.fn>).mock.calls;
    const keys = calls.map((c) => String(c[1]));
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toBe('dfp:user-1:fund-trip:0.3');
    // dedupKey 同时落为 health_events.trigger_id — 幂等锚点串必须 canonical
    expect(createHealthEvent).toHaveBeenCalledWith(expect.objectContaining({ triggerId: 'dfp:user-1:fund-trip:0.3' }));
  });
});

describe('AUDIT-6 / audit 锚点补测 (R123)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isToolCallInProgress as ReturnType<typeof vi.fn>).mockReturnValue(false);
    mockFunds = [
      { fund_id: 'fund-trip', name: 'Trip', target: 1000, current: 100, emoji: '✈️', sort_order: 0, created_at: '2026-01-01' },
    ];
  });

  function ctxWithUnsettled(amount: number) {
    // 重写 from: dream_funds 走 mockFunds, active_challenges 回 unsettled 数据, 其余空链
    const emptyChain = {
      select: vi.fn(() => emptyChain),
      eq: vi.fn(() => emptyChain),
      order: vi.fn(() => emptyChain),
      gte: vi.fn(() => emptyChain),
      limit: vi.fn(async () => ({ data: [], error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
    };
    const unsettledChain = {
      select: vi.fn(() => unsettledChain),
      eq: vi.fn(() => unsettledChain),
      order: vi.fn(() => unsettledChain),
      gte: vi.fn(() => unsettledChain),
      limit: vi.fn(async () => ({ data: [{ id: 'ch-1', amount, deposit_status: 'unsettled' }], error: null })),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn(() => ({ eq: vi.fn(() => ({ error: null })) })),
    };
    const ctx = makeCtx({ amount });
    (ctx.supabase as { from: unknown }).from = vi.fn((table: string) => {
      if (table === 'dream_funds') {
        const fundChain = {
          select: vi.fn(() => fundChain),
          eq: vi.fn(() => fundChain),
          order: vi.fn(() => fundChain),
          then: (resolve: (v: unknown) => void) => resolve({ data: mockFunds, error: null }),
        };
        return fundChain;
      }
      if (table === 'active_challenges') return unsettledChain;
      return emptyChain;
    });
    return ctx;
  }

  it('AUDIT-6: unsettled 同额 challenge → 跳过不加钱 (amountAdded=0, skipped=true)', async () => {
    const res = await handleAddDreamFundProgress(ctxWithUnsettled(50));
    expect(res.success).toBe(true);
    expect(res.result).toMatchObject({ amountAdded: 0, skipped: true });
    expect(applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(res.message).toMatch(/double-count/);
  });

  it('AUDIT-6: 金额差 ≥ $0.01 不算同额 (89 vs 89.005 仍入账)', async () => {
    const res = await handleAddDreamFundProgress(ctxWithUnsettled(89.005));
    // mock unsettled 89 vs amount 89.005: |diff|=0.005 < 0.01 → 匹配 → skip。反过来测:
    expect(res.result).toMatchObject({ amountAdded: 0, skipped: true });
  });

  it('BUG-88: createHealthEvent 以 dedupKey 为 triggerId + metadata 带 fundId/amount/progress', async () => {
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 30 }));
    expect(res.success).toBe(true);
    expect(createHealthEvent).toHaveBeenCalledTimes(1);
    const call = (createHealthEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.triggerSource).toBe('chat_mcp');
    expect(call.triggerId).toMatch(/^dfp:/);
    expect(call.metadata).toMatchObject({ fundId: 'fund-trip', amount: 30 });
    expect(call.eventType).toBe('challenge_reward');
  });

  it('BUG-88: createHealthEvent 失败 → success 仍 true 但 message 提示 retry + healthEventCreated=false', async () => {
    (createHealthEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: false, error: 'db down' });
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 40 }));
    expect(res.success).toBe(true);
    expect(res.result).toMatchObject({ healthEventCreated: false, auditLogged: false });
    expect(res.message).toMatch(/retry to ensure health log/i);
  });

  it('Round 42 REVIEW-6: auditLogged alias 与 healthEventCreated 一致', async () => {
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 55 }));
    expect(res.result.healthEventCreated).toBe(res.result.auditLogged);
  });

  it('成功消息: 金额+基金名+百分比 三要素', async () => {
    const res = await handleAddDreamFundProgress(makeCtx({ amount: 10 }));
    expect(res.message).toMatch(/Added \$10 to "Trip"/);
    expect(res.message).toMatch(/Progress: \d+%/);
  });
});
