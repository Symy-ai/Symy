import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  applyBuddyStateDelta: vi.fn(),
  getUserLocale: vi.fn(() => Promise.resolve('zh')),
  isToolCallInProgress: vi.fn(() => false),
  releaseToolCallLock: vi.fn(),
  isDuplicateHealthEvent: vi.fn(() => Promise.resolve(false)),
  createHealthEvent: vi.fn(async () => {}),
}));
vi.mock('../_shared', () => ({
  applyBuddyStateDelta: M.applyBuddyStateDelta,
  getUserLocale: M.getUserLocale,
  isToolCallInProgress: M.isToolCallInProgress,
  releaseToolCallLock: M.releaseToolCallLock,
  isDuplicateHealthEvent: M.isDuplicateHealthEvent,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  DEFAULT_LEVEL: 1,
  MCPHandlerContext: {},
  MCPToolResult: {},
}));
vi.mock('@/lib/health-impact', () => ({ createHealthEvent: M.createHealthEvent }));
vi.mock('server-only', () => ({}));

import { handleAddTokens } from '../add_tokens';

const ctx = (args: Record<string, unknown> = {}) => ({
  toolCallId: 'tc1',
  userId: 'u1',
  args,
}) as never;

/**
 * add_tokens.ts (120行) — 代币奖励 handler (Round 2 C3 幂等+BUG-94 原子+BUG-84 audit-only)。
 *
 * 锁定:
 * - amount 钳制 [1,50]+ceil 整数化 (E4); 默认 3
 * - reason 三档 vitality/xp 映射 (survival 2/10, growth 5/20, pleasure 3/15)
 * - in-progress 锁 → duplicate 短路; DB dedup → idempotent 短路
 * - 成功: delta 原子+audit (override=0 防 BUG-84 双写)+auditLogged flag
 * - delta 失败 → success:false; audit 失败 → auditLogged:false 仍 success
 */
describe('handleAddTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.getUserLocale.mockResolvedValue('zh');
    M.isDuplicateHealthEvent.mockResolvedValue(false);
    M.isToolCallInProgress.mockReturnValue(false);
  });

  it('amount 钳制+ceil (E4); 默认 3', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({ success: true, tokens: 10, vitality: 50, level: 2 });
    const r1 = await handleAddTokens(ctx({ amount: 2.5 }) as never);
    expect(r1.result.tokensAdded).toBe(3); // ceil(2.5)
    const r2 = await handleAddTokens(ctx({ amount: 99 }) as never);
    expect(r2.result.tokensAdded).toBe(50); // 上钳
    const r3 = await handleAddTokens(ctx({}) as never);
    expect(r3.result.tokensAdded).toBe(3); // 默认
    expect(M.applyBuddyStateDelta).toHaveBeenCalledTimes(3);
  });

  it('reason 三档 vitality/xp 映射', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({ success: true, tokens: 10, vitality: 50 });
    const survival = await handleAddTokens(ctx({ reason: 'survival' }) as never);
    expect(survival.result.vitalityBoost).toBe(2);
    expect(survival.result.xpGain).toBe(10);
    const growth = await handleAddTokens(ctx({ reason: 'growth' }) as never);
    expect(growth.result.vitalityBoost).toBe(5);
    expect(growth.result.xpGain).toBe(20);
    const pleasure = await handleAddTokens(ctx({}) as never);
    expect(pleasure.result.vitalityBoost).toBe(3);
    expect(pleasure.result.xpGain).toBe(15);
  });

  it('in-progress 锁 → duplicate 短路 (零 delta)', async () => {
    M.isToolCallInProgress.mockReturnValue(true);
    const r = await handleAddTokens(ctx() as never);
    expect(r.success).toBe(true);
    expect(r.message).toContain('already being processed');
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(M.releaseToolCallLock).not.toHaveBeenCalled(); // 锁持有者释放
  });

  it('DB dedup → idempotent 短路', async () => {
    M.isDuplicateHealthEvent.mockResolvedValue(true);
    const r = await handleAddTokens(ctx() as never);
    expect(r.success).toBe(true);
    expect(r.message).toContain('duplicate');
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled();
    expect(M.releaseToolCallLock).toHaveBeenCalledWith(expect.stringContaining('at:u1:'));
  });

  it('成功: 原子 delta+audit override=0 (BUG-84)+auditLogged', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({ success: true, tokens: 13, vitality: 53, level: 2 });
    const r = await handleAddTokens(ctx({ amount: 3, reason: 'growth' }) as never);
    expect(M.applyBuddyStateDelta).toHaveBeenCalledWith('u1', { tokenDelta: 3, vitalityDelta: 5, xpDelta: 20 });
    expect(M.createHealthEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      eventType: 'challenge_reward',
      vitalityOverride: 0,
      tokenOverride: 0,
    }));
    expect(r.success).toBe(true);
    expect(r.result.auditLogged).toBe(true);
    expect(r.result.newTokens).toBe(13);
    expect(M.releaseToolCallLock).toHaveBeenCalled();
  });

  it('delta 失败 → success:false; audit 失败 → auditLogged:false 仍 success', async () => {
    M.applyBuddyStateDelta.mockResolvedValue({ success: false, error: 'db down' });
    const r = await handleAddTokens(ctx() as never);
    expect(r.success).toBe(false);
    expect(M.createHealthEvent).not.toHaveBeenCalled();
    expect(M.releaseToolCallLock).toHaveBeenCalled();
    // audit 失败路径
    M.applyBuddyStateDelta.mockResolvedValue({ success: true, tokens: 10, vitality: 50 });
    M.createHealthEvent.mockRejectedValueOnce(new Error('audit fail'));
    const r2 = await handleAddTokens(ctx() as never);
    expect(r2.success).toBe(true);
    expect(r2.result.auditLogged).toBe(false); // MEDIUM-3 flag
  });
});
