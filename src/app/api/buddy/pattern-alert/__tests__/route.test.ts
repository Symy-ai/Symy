import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/with-auth', () => ({
  // identity 透传 (R361 定案)
  withAuth: (fn: (args: unknown) => unknown, _opts?: unknown) => fn,
}));

import { GET } from '../route';

function makeArgs(rows: unknown[], error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'order']) chain[m] = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve({ data: rows, error }));
  return { supabase: { from: () => chain }, user: { id: 'u1' }, chain };
}

/**
 * buddy/pattern-alert route (66行) — 失败模式预警 (P1-2, PM-#7)。
 *
 * 锁定:
 * - ≥2 真失败 → alert=true (banner 触发)
 * - dismissed 过滤 (用户忽略 ≠ 买了 — PM-#7 红线)
 * - completed_at 缺失回退 created_at
 * - 查询失败 → 500; 形状锚 (user 隔离+7 天窗+倒序+limit 10)
 */
describe('GET /api/buddy/pattern-alert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('≥2 真失败 → alert=true', async () => {
    const rows = [
      { item_name: '耳机', amount: 299, completed_at: '2026-10-09', created_at: '2026-10-01', metadata: null },
      { item_name: '奶茶', amount: 25, completed_at: '2026-10-08', created_at: '2026-10-08', metadata: {} },
    ];
    const r = (await GET(makeArgs(rows) as never)) as Response;
    const body = await r.json();
    expect(body.alert).toBe(true);
    expect(body.failedCount).toBe(2);
    expect(body.recentFailures[0]).toEqual({ itemName: '耳机', amount: 299, createdAt: '2026-10-09' });
  });

  it('dismissed 过滤 (PM-#7): 2 真失败+1 dismissed → 不告警', async () => {
    const rows = [
      { item_name: 'A', amount: 10, completed_at: 't1', created_at: 't0', metadata: null },
      { item_name: 'B', amount: 10, completed_at: 't2', created_at: 't0', metadata: { dismissed: true } }, // 被忽略
    ];
    const r = (await GET(makeArgs(rows) as never)) as Response;
    const body = await r.json();
    expect(body.alert).toBe(false); // 真失败只有 1
    expect(body.failedCount).toBe(1);
  });

  it('completed_at 缺失 → 回退 created_at', async () => {
    const rows = [{ item_name: 'X', amount: 5, completed_at: null, created_at: 'fallback-ts', metadata: null }];
    const r = (await GET(makeArgs(rows) as never)) as Response;
    expect((await r.json()).recentFailures[0].createdAt).toBe('fallback-ts');
  });

  it('查询失败 → 500', async () => {
    const r = (await GET(makeArgs([], { message: 'rls' }) as never)) as Response;
    expect(r.status).toBe(500);
  });

  it('零失败 → alert=false 空列表', async () => {
    const r = (await GET(makeArgs([]) as never)) as Response;
    const body = await r.json();
    expect(body).toEqual({ alert: false, failedCount: 0, recentFailures: [] });
  });

  it('形状锚: user 隔离+failed+7 天窗+倒序+limit 10', async () => {
    const args = makeArgs([]);
    await GET(args as never);
    const c = args.chain as Record<string, ReturnType<typeof vi.fn>>;
    expect(c.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(c.eq).toHaveBeenCalledWith('status', 'failed');
    expect(c.gte).toHaveBeenCalledWith('completed_at', expect.any(String));
    expect(c.order).toHaveBeenCalledWith('completed_at', { ascending: false });
    expect(c.limit).toHaveBeenCalledWith(10);
  });
});
