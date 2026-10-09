import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateChain, createAdminClient } = vi.hoisted(() => {
  const updateChain = {
    update: vi.fn(),
    eq: vi.fn(),
  };
  updateChain.update.mockReturnValue(updateChain);
  // 自引用 thenable: .eq().eq()...任意跳后 await — 既是 thenable 又可继续链
  const tail: { eq: () => unknown; then: (r: (v: { error: unknown }) => unknown) => unknown } = {
    eq: (...a: unknown[]) => { updateChain.eq(...(a as [string, string])); return tail; },
    then: (r: (v: { error: unknown }) => unknown) => Promise.resolve({ error: null }).then(r),
  };
  updateChain.eq.mockReturnValue(tail);
  const createAdminClient = vi.fn(() => ({ supabase: { from: vi.fn(() => updateChain) } }));
  return { updateChain, createAdminClient };
});
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('server-only', () => ({}));

import { rollbackChallengeStatusOnFailure } from '../cas-rollback';
import { logger } from '@/lib/logger';

/**
 * cas-rollback.ts (74行) — CAS 失败回滚 (Round 120 AUDIT-6 P0 #1 修复件)。
 *
 * 锁定:
 * - 成功: update 三字段 (status='active'/completed_at=null/
 *   deposit_status='unsettled' 非 null — NOT NULL 红线) + 双 eq 条件 → true
 * - admin client 不可用 → false + error 日志
 * - DB error → false + error 日志 (user stuck 告警语义)
 * - 抛错 → false 不上抛 (fail-closed, 不掩盖原始错误)
 */
describe('rollbackChallengeStatusOnFailure CAS 回滚', () => {
  beforeEach(() => vi.clearAllMocks());

  it('成功: 三字段重置 + 双 eq 条件', async () => {
    const ok = await rollbackChallengeStatusOnFailure('u1', 'c1');
    process.stdout.write('PROBE ok=' + ok + ' errcalls=' + vi.mocked(logger.error).mock.calls.length + ' args=' + JSON.stringify(vi.mocked(logger.error).mock.calls.map((c: unknown[]) => String(c[0]).slice(0,60))));
    expect(ok).toBe(true);
    expect(updateChain.update).toHaveBeenCalledWith({
      status: 'active',
      completed_at: null,
      deposit_status: 'unsettled', // NOT NULL DEFAULT — 绝非 null (AUDIT-6 红线)
    });
    expect(updateChain.eq).toHaveBeenCalledWith('id', 'c1');
    expect(updateChain.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(logger.info).toHaveBeenCalled();
  });

  it('admin client 不可用 → false + error', async () => {
    createAdminClient.mockReturnValueOnce({ supabase: null } as never);
    const ok = await rollbackChallengeStatusOnFailure('u1', 'c1');
    expect(ok).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('admin client unavailable'));
  });

  it('DB error → false + user stuck 告警日志', async () => {
    updateChain.eq.mockImplementationOnce(() => ({ then: (r: (v: { error: unknown }) => unknown) => Promise.resolve({ error: new Error('conn drop') }).then(r) }));
    const ok = await rollbackChallengeStatusOnFailure('u1', 'c1');
    expect(ok).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('manual intervention'),
      expect.any(Error),
    );
  });

  it('抛错 → false 不上抛 (fail-closed)', async () => {
    updateChain.eq.mockImplementationOnce(() => {
      throw new Error('sync boom');
    });
    const ok = await rollbackChallengeStatusOnFailure('u1', 'c1');
    expect(ok).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('ALSO failed'), expect.anything());
  });
});
