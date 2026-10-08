import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_shared')>();
  return {
    ...actual,
    isToolCallInProgress: vi.fn(() => false),
    releaseToolCallLock: vi.fn(),
    isDuplicateHealthEvent: vi.fn(() => Promise.resolve(false)),
    applyBuddyStateDelta: vi.fn(() => Promise.resolve({ success: true, vitality: 80, error: null })),
    getUserLocale: vi.fn(() => Promise.resolve('en')),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});
vi.mock('@/lib/health-impact', () => ({
  createHealthEvent: vi.fn(() => Promise.resolve({ success: true, eventId: 'e1' })),
}));
vi.mock('../descriptions', () => ({
  vitalityAdjustedDesc: (locale: string, amount: number, v: number, reason: string) =>
    `[${locale}] vitality ${amount}→${v} (${reason})`,
}));

import { handleAddVitality } from '../add_vitality';
import { applyBuddyStateDelta, isDuplicateHealthEvent, isToolCallInProgress } from '../_shared';
import { createHealthEvent } from '@/lib/health-impact';

const mockDelta = vi.mocked(applyBuddyStateDelta);
const mockDup = vi.mocked(isDuplicateHealthEvent);
const mockLock = vi.mocked(isToolCallInProgress);
const mockHealth = vi.mocked(createHealthEvent);

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    toolCallId: 'tc-1',
    args: { amount: 10, reason: 'healing' },
    userId: 'u1',
    supabase: {},
    ...overrides,
  } as never;
}

/**
 * add_vitality.ts (124行) — 伙伴活力直接调整 (Round 2 C3 幂等件)。
 *
 * 锁定:
 * - NaN 防御 (Round 69 BUG-AUDIT-69-3: Number.isFinite)
 * - ±100 范围 (BUG-R4-4)
 * - 内存锁 / DB 去重 (Round 2 C3 + Round 11 C1 确定性 key)
 * - amount=0 → 零写入直返 (Round 2 M7)
 * - 成功: vitalityDelta + 审计 metadata 三字段
 * - delta 失败 → success=false
 * - 审计失败 → auditLogged=false 非关键
 */
describe('handleAddVitality', () => {
  beforeEach(() => vi.clearAllMocks());

  it('NaN 防御: "abc" → Invalid finite number', async () => {
    const res = await handleAddVitality(makeCtx({ args: { amount: 'abc', reason: 'x' } }));
    expect(res.success).toBe(false);
    expect(res.message).toContain('finite number');
    expect(mockDelta).not.toHaveBeenCalled();
  });

  it('±100 范围: 101/-101 拒绝; 边界 ±100 通过', async () => {
    const bad1 = await handleAddVitality(makeCtx({ args: { amount: 101, reason: 'x' } }));
    expect(bad1.success).toBe(false);
    const bad2 = await handleAddVitality(makeCtx({ args: { amount: -101, reason: 'x' } }));
    expect(bad2.success).toBe(false);
    const ok = await handleAddVitality(makeCtx({ args: { amount: 100, reason: 'x' } }));
    expect(ok.success).toBe(true);
  });

  it('内存锁命中 → duplicate in-progress', async () => {
    mockLock.mockReturnValueOnce(true);
    const res = await handleAddVitality(makeCtx());
    expect(res.message).toContain('Duplicate request');
    expect(mockDelta).not.toHaveBeenCalled();
  });

  it('DB 去重 → already adjusted + 锁释放', async () => {
    mockDup.mockResolvedValueOnce(true);
    const res = await handleAddVitality(makeCtx());
    expect(res.message).toContain('already adjusted');
    expect(mockDelta).not.toHaveBeenCalled();
  });

  it('amount=0 → 零写入直返 (Round 2 M7)', async () => {
    const res = await handleAddVitality(makeCtx({ args: { amount: 0, reason: 'no-op' } }));
    expect(res.success).toBe(true);
    expect(res.result).toMatchObject({ vitalityChange: 0, note: 'No change (amount=0)' });
    expect(mockDelta).not.toHaveBeenCalled();
    expect(mockHealth).not.toHaveBeenCalled();
  });

  it('成功: delta vitalityDelta + 审计 triggerId av: 格式 + metadata 三字段', async () => {
    const res = await handleAddVitality(makeCtx({ args: { amount: -5, reason: 'impulse damage' } }));
    expect(res.success).toBe(true);
    expect(res.result).toMatchObject({ vitalityChange: -5, newVitality: 80, auditLogged: true });
    expect(res.message).toContain('-5 → 80');
    expect(mockDelta).toHaveBeenCalledWith('u1', { vitalityDelta: -5 });
    const call = mockHealth.mock.calls[0][0];
    expect(call.triggerId).toMatch(/^av:u1:-5:impulse damage:\d+$/);
    expect(call.eventType).toBe('manual_adjustment');
    expect(call.metadata).toEqual({ amount: -5, reason: 'impulse damage', newVitality: 80 });
  });

  it('delta 失败 → success=false + error 透传', async () => {
    mockDelta.mockResolvedValueOnce({ success: false, vitality: undefined, error: 'rpc down' } as never);
    const res = await handleAddVitality(makeCtx());
    expect(res.success).toBe(false);
    expect(res.message).toContain('rpc down');
  });

  it('审计失败 → auditLogged=false 仍 success (Round 41 MEDIUM-3)', async () => {
    mockHealth.mockRejectedValueOnce(new Error('audit down') as never);
    const res = await handleAddVitality(makeCtx());
    expect(res.success).toBe(true);
    expect(res.result.auditLogged).toBe(false);
  });
});
