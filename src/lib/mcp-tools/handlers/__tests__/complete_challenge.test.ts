import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  applyBuddyStateDelta: vi.fn(),
  getUserLocale: vi.fn((): Promise<string> => Promise.resolve('zh')),
  isToolCallInProgress: vi.fn((_k?: string) => false),
  releaseToolCallLock: vi.fn(),
  isDuplicateHealthEvent: vi.fn((): Promise<boolean> => Promise.resolve(false)),
  acquireDistributedToolCallLock: vi.fn((): Promise<boolean> => Promise.resolve(true)),
  releaseDistributedToolCallLock: vi.fn(),
  getChallengeById: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock('../_shared', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../_shared')>();
  return {
    ...orig,
    applyBuddyStateDelta: M.applyBuddyStateDelta,
    getUserLocale: M.getUserLocale,
    isToolCallInProgress: M.isToolCallInProgress,
    releaseToolCallLock: M.releaseToolCallLock,
    isDuplicateHealthEvent: M.isDuplicateHealthEvent,
    acquireDistributedToolCallLock: M.acquireDistributedToolCallLock,
    releaseDistributedToolCallLock: M.releaseDistributedToolCallLock,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});
vi.mock('@/lib/user-hourly-rate', () => ({ getUserHourlyRate: vi.fn((): Promise<number> => Promise.resolve(50)) }));
const challengeStore = vi.hoisted(() => ({ getChallengeById: vi.fn() }));
vi.mock('@/lib/challenge-store', () => ({ getChallengeById: challengeStore.getChallengeById }));
const adminMock = vi.hoisted(() => ({ rpc: vi.fn((): Promise<{ data: unknown; error: unknown }> => Promise.resolve({ data: null, error: null })) }));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => Promise.resolve({ supabase: { rpc: adminMock.rpc, from: vi.fn(() => ({})) } })),
}));
vi.mock('@/lib/health-impact', () => ({ createHealthEvent: vi.fn((): Promise<unknown> => Promise.resolve({ success: true })) }));
vi.mock('server-only', () => ({}));

import { handleCompleteChallenge } from '../complete_challenge';

/**
 * complete_challenge.ts (797行) — 挑战完成 handler (战役最大件)。
 *
 * 锁定 (入口段+幂等三层, 巨型 CAS 主干由冒烟护航):
 * - 模式 B: saved_amount NaN/≤0 → false 引导重试
 * - challenge_id 模式: 不存在 → false; 已完成 → alreadyCompleted 友好返回
 * - 幂等三层: in-progress 锁/分布式锁/DB dedup → 全 alreadyCompleted
 * - challenge_type 自动修正 (金额阈值)
 */
describe('handleCompleteChallenge 入口+幂等', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.isDuplicateHealthEvent.mockResolvedValue(false);
    M.isToolCallInProgress.mockReturnValue(false);
    M.acquireDistributedToolCallLock.mockResolvedValue(true);
  });

  it('模式 B: saved_amount 非法 → false 引导重试', async () => {
    const r = await handleCompleteChallenge({ toolCallId: 'tc1', userId: 'u1', args: { saved_amount: 'abc' } } as never);
    expect(r.success).toBe(false);
    expect(r.message).toContain('retry');
    const r2 = await handleCompleteChallenge({ toolCallId: 'tc1', userId: 'u1', args: { saved_amount: -5 } } as never);
    expect(r2.success).toBe(false);
  });

  it('challenge_id 模式: 不存在 → false; 已完成 → alreadyCompleted', async () => {
    challengeStore.getChallengeById.mockResolvedValueOnce({ success: false });
    const r1 = await handleCompleteChallenge({ toolCallId: 'tc1', userId: 'u1', args: { challenge_id: '11111111-1111-1111-1111-111111111111' } } as never);
    expect(r1.success).toBe(false);
    expect(r1.message).toContain('not found');
    // 已完成态 (passed)
    challengeStore.getChallengeById.mockResolvedValueOnce({
      success: true,
      challenge: { status: 'passed', challenge_type: 'big_save', amount: 100 },
    });
    const r2 = await handleCompleteChallenge({ toolCallId: 'tc1', userId: 'u1', args: { challenge_id: '11111111-1111-1111-1111-111111111111' } } as never);
    expect(r2.success).toBe(true);
    expect(r2.result.alreadyCompleted).toBe(true);
  });

  it('幂等三层: 内存锁/分布式锁/DB dedup → alreadyCompleted', async () => {
    // 内存锁
    M.isToolCallInProgress.mockImplementation((k?: string) => !!k && k.startsWith('cc:'));
    const r1 = await handleCompleteChallenge({ toolCallId: 'tc1', userId: 'u1', args: { saved_amount: 50, challenge_type: 'quick_pass' } } as never);
    expect(r1.success).toBe(true);
    expect(r1.result.alreadyCompleted).toBe(true);
    // 分布式锁
    M.isToolCallInProgress.mockReturnValue(false);
    M.acquireDistributedToolCallLock.mockResolvedValue(false);
    const r2 = await handleCompleteChallenge({ toolCallId: 'tc1', userId: 'u1', args: { saved_amount: 50 } } as never);
    expect(r2.result.alreadyCompleted).toBe(true);
    // DB dedup
    M.acquireDistributedToolCallLock.mockResolvedValue(true);
    M.isDuplicateHealthEvent.mockResolvedValue(true);
    const r3 = await handleCompleteChallenge({ toolCallId: 'tc1', userId: 'u1', args: { saved_amount: 50 } } as never);
    expect(r3.result.alreadyCompleted).toBe(true);
    expect(M.applyBuddyStateDelta).not.toHaveBeenCalled(); // 三层全短路零写入
  });

  it('challenge_type 金额阈值自动修正', async () => {
    M.isDuplicateHealthEvent.mockResolvedValue(true); // 走到 dedup 前 type 已修正
    const r = await handleCompleteChallenge({ toolCallId: 'tc1', userId: 'u1', args: { saved_amount: 300, challenge_type: 'quick_pass' } } as never);
    expect(r.success).toBe(true);
    expect(r.result.challengeType).not.toBe('quick_pass'); // 300 → big_save 修正
  });
});
