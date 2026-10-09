import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  applyBuddyStateDelta: vi.fn(),
  getUserLocale: vi.fn(() => Promise.resolve('zh')),
  isToolCallInProgress: vi.fn(() => false),
  releaseToolCallLock: vi.fn(),
  isDuplicateHealthEvent: vi.fn(() => Promise.resolve(false)),
  createHealthEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock('../_shared', () => ({
  applyBuddyStateDelta: M.applyBuddyStateDelta,
  getUserLocale: M.getUserLocale,
  isToolCallInProgress: M.isToolCallInProgress,
  releaseToolCallLock: M.releaseToolCallLock,
  isDuplicateHealthEvent: M.isDuplicateHealthEvent,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  MCPHandlerContext: {},
  MCPToolResult: {},
}));
vi.mock('@/lib/health-impact', () => ({ createHealthEvent: M.createHealthEvent }));
vi.mock('server-only', () => ({}));

import { handleAddVitality } from '../add_vitality';

const ctx = (args: Record<string, unknown> = {}) => ({ toolCallId: 'tc1', userId: 'u1', args }) as never;

/**
 * add_vitality.ts (124行) — 活力调整 handler (Round 2 C3+Round 69 NaN 防线+BUG-R4-4 范围)。
 *
 * 锁定:
 * - NaN → false (Round 69 审计); |amount|>100 → false
 * - in-progress/DB dedup 双短路 (av: 前缀 triggerId)
 * - amount=0 → 零写入直返 (M7)
 * - 正常: vitalityDelta 原子+audit override=0+auditLogged
 */
describe('handleAddVitality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.isDuplicateHealthEvent.mockResolvedValue(false);
    M.isToolCallInProgress.mockReturnValue(false);
  });

  it('NaN → false (Round 69 BUG-AUDIT-69-3)', async () => {
    const r = await handleAddVitality(ctx({ amount: 'abc' }) as never);
    expect(r.success).toBe(false);
    expect(r.message).toContain('finite number');
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('|amount|>100 → false (BUG-R4-4)', async () => {
    expect((await handleAddVitality(ctx({ amount: 101 }) as never)).success).toBe(false);
    expect((await handleAddVitality(ctx({ amount: -150 }) as never)).success).toBe(false);
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('amount=0 → 零写入直返 (M7)', async () => {
    const r = await handleAddVitality(ctx({ amount: 0, reason: 'no-op' }) as never);
    expect(r.success).toBe(true);
    expect(r.result.vitalityChange).toBe(0);
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(M.releaseToolCallLock).toHaveBeenCalled();
  });

  it('双短路: in-progress 锁+DB dedup (av: triggerId)', async () => {
    M.isToolCallInProgress.mockReturnValue(true);
    const r1 = await handleAddVitality(ctx({ amount: 5 }) as never);
    expect(r1.message).toContain('already being processed');
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
    M.isToolCallInProgress.mockReturnValue(false);
    M.isDuplicateHealthEvent.mockResolvedValue(true);
    const r2 = await handleAddVitality(ctx({ amount: 5 }) as never);
    expect(r2.message).toContain('duplicate');
    expect(M.releaseToolCallLock).toHaveBeenCalledWith(expect.stringContaining('av:u1:'));
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
  });

  it('正常: 原子 delta+audit (manual_adjustment+override=0)+auditLogged', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({ success: true, vitality: 55 });
    const r = await handleAddVitality(ctx({ amount: -5, reason: 'stayed-up' }) as never);
    expect(M.applyBuddyStateDelta).toHaveBeenCalledWith('u1', { vitalityDelta: -5 });
    expect(M.createHealthEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      eventType: 'manual_adjustment',
      vitalityOverride: 0,
    }));
    expect(r.success).toBe(true);
    expect(r.result.newVitality).toBe(55);
    expect(r.result.auditLogged).toBe(true);
    expect(r.message).toContain('-5');
  });
});
