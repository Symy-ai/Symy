import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  applyBuddyStateDelta: vi.fn(),
  getUserLocale: vi.fn((): Promise<string> => Promise.resolve('zh')),
  isToolCallInProgress: vi.fn((_k?: string) => false),
  releaseToolCallLock: vi.fn(),
  isDuplicateHealthEvent: vi.fn((): Promise<boolean> => Promise.resolve(false)),
  createHealthEvent: vi.fn((): Promise<{ success: boolean; eventId?: string; error?: string }> =>
    Promise.resolve({ success: true, eventId: 'e1' })),
  DEFAULT_DREAM_FUNDS: [
    { id: 'savings', name: 'Savings', target: 1000, current: 100, emoji: '🏦' },
    { id: 'trip', name: 'Trip', target: 500, current: 300, emoji: '✈️' },
  ],
  SAVINGS_FUND_ID: 'savings',
}));
vi.mock('../_shared', () => ({
  applyBuddyStateDelta: M.applyBuddyStateDelta,
  getUserLocale: M.getUserLocale,
  isToolCallInProgress: M.isToolCallInProgress,
  releaseToolCallLock: M.releaseToolCallLock,
  isDuplicateHealthEvent: M.isDuplicateHealthEvent,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  DEFAULT_DREAM_FUNDS: M.DEFAULT_DREAM_FUNDS,
  SAVINGS_FUND_ID: M.SAVINGS_FUND_ID,
  MCPHandlerContext: {},
  MCPToolResult: {},
}));
vi.mock('../descriptions', () => ({
  dreamFundProgressDesc: vi.fn(() => 'desc'),
  getHourlyRateFromArgs: vi.fn(() => null),
}));
vi.mock('@/lib/user-hourly-rate', () => ({ getUserHourlyRate: vi.fn((): Promise<number> => Promise.resolve(50)) }));
vi.mock('@/lib/health-impact', () => ({ createHealthEvent: M.createHealthEvent }));
vi.mock('server-only', () => ({}));

import { handleAddDreamFundProgress } from '../add_dream_fund_progress';

function chain(selectData: unknown, unsettled: unknown[] = [], updateErr: unknown = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        // dream_funds: .eq(user_id).order.sort_order.order.created_at → data
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            order: vi.fn(() => ({ data: selectData })),
          })),
          // active_challenges: .eq.eq.eq.order.limit → data
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({ data: unsettled })),
              })),
            })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: updateErr })),
        })),
      })),
    })),
  };
}

const ctx = (args: Record<string, unknown>, sb: ReturnType<typeof chain>) =>
  ({ toolCallId: 'tc1', userId: 'u1', args, supabase: sb } as never);

/**
 * add_dream_fund_progress.ts (273行) — 梦想基金入账 (E5 幻觉上限+Round 30 双计防线+Round 23 C3)。
 *
 * 锁定:
 * - amount NaN/≤0 → false 引导重试; >$1M 幻觉上限拒绝 (E5)
 * - unsettled 同额 challenge → skip 防双计 (Round 30 AUDIT-6)
 * - in-progress 锁短路 (分位归一 key — E5)
 * - 成功: 原子 delta (dreamFund+totalSaved)+表同步 post-delta current (Round 23 C3)+audit
 */
describe('handleAddDreamFundProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.isDuplicateHealthEvent.mockResolvedValue(false);
    M.isToolCallInProgress.mockReturnValue(false);
  });

  it('amount NaN/≤0 → false 引导重试', async () => {
    const r1 = await handleAddDreamFundProgress(ctx({ amount: 'abc' }, chain([])) as never);
    expect(r1.success).toBe(false);
    expect(r1.message).toContain('retry');
    const r2 = await handleAddDreamFundProgress(ctx({ amount: 0 }, chain([])) as never);
    expect(r2.success).toBe(false);
  });

  it('幻觉上限: >$1M 拒绝 (E5)', async () => {
    const r = await handleAddDreamFundProgress(ctx({ amount: 2_000_000 }, chain([])) as never);
    expect(r.success).toBe(false);
    expect(r.message).toContain('1,000,000');
    expect(r.message).toContain('Do not invent');
  });

  it('in-progress 锁短路 (amount 分位归一 key)', async () => {
    M.isToolCallInProgress.mockImplementation((k?: string) => !!k && k.includes('dfp:u1'));
    const r = await handleAddDreamFundProgress(ctx({ amount: 50 }, chain([])) as never);
    expect(r.success).toBe(true);
    expect(r.message).toContain('already recorded');
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('成功: 原子 delta+表同步 post-delta current+audit', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({
      success: true,
      totalSaved: 500,
      dreamFunds: [
        { id: 'trip', name: 'Trip', target: 500, current: 400, emoji: '✈️' }, // post-delta 400
      ],
      badges: [],
    });
    const sb = chain([
      { fund_id: 'trip', name: 'Trip', target: 500, current: 300, emoji: '✈️' },
    ]);
    const r = await handleAddDreamFundProgress(ctx({ fund_id: 'trip', amount: 100 }, sb) as never);
    expect(M.applyBuddyStateDelta).toHaveBeenCalledWith('u1', expect.objectContaining({
      dreamFundId: 'trip',
      dreamFundAmount: 100,
      totalSavedDelta: 100,
    }));
    expect(r.success).toBe(true);
    expect(r.result.newCurrent).toBe(400); // post-delta (Round 23 C3)
    expect(r.result.progress).toBe(80); // 400/500
    expect(r.result.auditLogged).toBe(true);
    expect(M.releaseToolCallLock).toHaveBeenCalled();
  });

  it('dream_builder 徽章: 预估进度 ≥50%', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({
      success: true,
      totalSaved: 600,
      dreamFunds: [{ id: 'trip', name: 'Trip', target: 500, current: 450, emoji: '✈️' }],
      badges: ['dream_builder'],
    });
    const sb = chain([
      { fund_id: 'trip', name: 'Trip', target: 500, current: 300, emoji: '✈️' }, // (300+100)/500=80% ≥50
    ]);
    const r = await handleAddDreamFundProgress(ctx({ fund_id: 'trip', amount: 100 }, sb) as never);
    expect(M.applyBuddyStateDelta).toHaveBeenCalledWith('u1', expect.objectContaining({
      addBadges: ['dream_builder'],
    }));
    expect(r.result.badgeAwarded).toBe(true);
  });

  it('audit 失败 → success 仍 true 但 message 含重试引导', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({
      success: true,
      totalSaved: 500,
      dreamFunds: [{ id: 'trip', name: 'Trip', target: 500, current: 400, emoji: '✈️' }],
      badges: [],
    });
    M.createHealthEvent.mockResolvedValueOnce({ success: false, error: 'db down' });
    const sb = chain([{ fund_id: 'trip', name: 'Trip', target: 500, current: 300, emoji: '✈️' }]);
    const r = await handleAddDreamFundProgress(ctx({ fund_id: 'trip', amount: 100 }, sb) as never);
    expect(r.success).toBe(true);
    expect(r.result.auditLogged).toBe(false);
    expect(r.message).toContain('retry');
  });
});
