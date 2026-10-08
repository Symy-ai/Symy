import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/companion-rpc', () => ({
  fireReplenishDailyNeed: vi.fn(() => Promise.resolve()),
  fireBumpIntimacy: vi.fn(() => Promise.resolve()),
  fireAddProactiveMessageWithVariety: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fireCompletionCompanionEffects } from '../companion-effects';
import {
  fireReplenishDailyNeed,
  fireBumpIntimacy,
  fireAddProactiveMessageWithVariety,
} from '@/lib/companion-rpc';
import { logger } from '@/lib/logger';

const mockReplenish = vi.mocked(fireReplenishDailyNeed);
const mockIntimacy = vi.mocked(fireBumpIntimacy);
const mockMsg = vi.mocked(fireAddProactiveMessageWithVariety);
const mockWarn = vi.mocked(logger.warn);

/**
 * companion-effects.ts (96行) — 挑战完成伴生 RPC (P0-5 + allSettled 双修复件)。
 *
 * 锁定:
 * - passed: clarity+20 / intimacy+3 / message challenge_completed
 * - failed: clarity+20 / intimacy+1 / message challenge_failed
 * - P0-5 红线: 任一 RPC reject 不抛 (挑战已提交)
 * - allSettled: 单 RPC 挂, 其余照常跑 + warn 计数日志
 */
describe('fireCompletionCompanionEffects', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passed: 三 RPC 并行, 参数锚 (clarity 20/intimacy 3/completed)', async () => {
    await fireCompletionCompanionEffects('u1', 'passed');
    expect(mockReplenish).toHaveBeenCalledWith('u1', 'clarity', 20);
    expect(mockIntimacy).toHaveBeenCalledWith('u1', 3);
    expect(mockMsg).toHaveBeenCalledWith('u1', 'challenge_completed');
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('failed: intimacy 1 + challenge_failed (接纳非评判)', async () => {
    await fireCompletionCompanionEffects('u1', 'failed');
    expect(mockIntimacy).toHaveBeenCalledWith('u1', 1);
    expect(mockMsg).toHaveBeenCalledWith('u1', 'challenge_failed');
  });

  it('P0-5 红线: 单 RPC reject 不抛 (挑战已提交不受伴生拖累)', async () => {
    mockIntimacy.mockRejectedValueOnce(new Error('rpc down') as never);
    await expect(fireCompletionCompanionEffects('u1', 'passed')).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('allSettled: 全部 reject 也不抛 + 3/3 计数日志', async () => {
    mockReplenish.mockRejectedValue(new Error('a') as never);
    mockIntimacy.mockRejectedValue(new Error('b') as never);
    mockMsg.mockRejectedValue(new Error('c') as never);
    await expect(fireCompletionCompanionEffects('u1', 'failed')).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('3/3'),
      expect.anything(),
    );
  });
});
