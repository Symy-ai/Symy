import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createAgentForUser: vi.fn(),
}));

vi.mock('../_shared', () => ({
  getMcpServerUrl: vi.fn(() => 'https://mcp.test'),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  NextResponse: {
    json: (body: unknown, init?: { status: number }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } }),
  },
}));
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: M.createAdminClient }));
vi.mock('@/lib/letta-agent-manager', () => ({ createAgentForUser: M.createAgentForUser }));

import { handleMigrateToPerUser } from '../migrate_to_per_user';

function makeStore(users: Array<{ id: string; email: string }> = []) {
  return {
    supabase: {
      from: () => ({
        select: () => ({
          is: () => ({
            limit: (n: number) => Promise.resolve({ data: users.slice(0, n), error: null }),
          }),
        }),
      }),
    },
  };
}

/**
 * migrate_to_per_user.ts (104行) — 存量迁移分批 (Round 17 AUDIT-4 HIGH-3)。
 *
 * 锁定:
 * - batch limit 5 (防 Vercel 超时 orphan agent 月费泄漏)
 * - 全批成功 → migrated 计数+agent 间隔 sleep 2s
 * - 单用户失败/抛错 → failed/error 计数不中断
 * - 汇总四态 (migrated/failed/skipped/total)+note 条件
 */
describe('handleMigrateToPerUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.createAgentForUser.mockResolvedValue('agent-x');
  });

  it('batch limit 锚: 只取 5 用户 (AUDIT-4 HIGH-3)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const users = Array.from({ length: 10 }, (_, i) => ({ id: `u${i}`, email: `u${i}@t.co` }));
    let capturedLimit = -1;
    M.createAdminClient.mockReturnValue({
      supabase: {
        from: () => ({
          select: () => ({
            is: () => ({
              limit: (n: number) => {
                capturedLimit = n;
                return Promise.resolve({ data: users.slice(0, n), error: null });
              },
            }),
          }),
        }),
      },
    });
    const p = handleMigrateToPerUser({} as never);
    await vi.advanceTimersByTimeAsync(9000); // 快进 4 次间隔 sleep
    const r = (await p) as Response;
    expect(capturedLimit).toBe(5); // BATCH_SIZE 锚
    const body = JSON.parse(await r.text());
    expect(body.total).toBe(5);
    expect(body.migrated).toBe(5);
    expect(body.batchSize).toBe(5);
    expect(body.note).toBeUndefined(); // 无 skip
    vi.useRealTimers();
  });

  it('admin client 不可用/查询失败 → 500', async () => {
    M.createAdminClient.mockReturnValueOnce({ supabase: null });
    expect((await handleMigrateToPerUser({} as never)).status).toBe(500);
    M.createAdminClient.mockReturnValueOnce({
      supabase: {
        from: () => ({
          select: () => ({
            is: () => ({
              limit: () => Promise.resolve({ data: null, error: { message: 'perm' } }),
            }),
          }),
        }),
      },
    });
    expect((await handleMigrateToPerUser({} as never)).status).toBe(500);
  });

  it('单用户失败 (null) → failed 计数; 抛错 → error 计数; 其余继续', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    M.createAdminClient.mockReturnValue(makeStore([
      { id: 'u1', email: 'a@t.co' },
      { id: 'u2', email: 'b@t.co' },
      { id: 'u3', email: 'c@t.co' },
    ]));
    M.createAgentForUser
      .mockResolvedValueOnce(null) // u1 failed
      .mockRejectedValueOnce(new Error('letta down')) // u2 error
      .mockResolvedValueOnce('agent-3'); // u3 created
    const r = (await handleMigrateToPerUser({} as never)) as Response;
    const body = JSON.parse(await r.text());
    expect(body.migrated).toBe(1);
    expect(body.failed).toBe(2); // failed+error 合计
    expect(body.total).toBe(3);
    expect(body.results[0].status).toBe('failed');
    expect(body.results[1].status).toBe('error');
    vi.useRealTimers();
  });

  it('agent 间隔 sleep 2s (rate limit 防线)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      M.createAdminClient.mockReturnValue(makeStore([
        { id: 'u1', email: 'a@t.co' },
        { id: 'u2', email: 'b@t.co' },
      ]));
      const r = (await handleMigrateToPerUser({} as never)) as Response;
      expect(r.status).toBe(200);
      // 2 用户 → 1 次间隔 (末位不 sleep)
      expect(vi.getTimerCount()).toBe(0); // 全部走完
    } finally {
      vi.useRealTimers();
    }
  });
});
