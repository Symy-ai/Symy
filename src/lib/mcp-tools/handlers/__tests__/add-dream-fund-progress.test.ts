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
import { isToolCallInProgress, applyBuddyStateDelta } from '../_shared';

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
