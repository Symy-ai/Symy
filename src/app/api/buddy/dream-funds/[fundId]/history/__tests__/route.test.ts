import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/with-auth', () => ({
  // identity 透传 (R361) — 泛型签名兼容 (第二参恒 undefined)
  withAuth: (fn: (args: unknown) => unknown, _opts?: unknown) => fn,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from '../route';

function makeArgs(rows: unknown[], error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.limit = vi.fn(() => Promise.resolve({ data: rows, error }));
  return {
    supabase: { from: () => chain },
    user: { id: 'u1' },
    params: { fundId: 'df-9' },
    chain,
  };
}

/**
 * dream-funds/[fundId]/history route (72行) — 基金填充历史 (PM-NEW-34)。
 *
 * 锁定:
 * - 缺 fundId → 400
 * - JS 层 metadata 三键兼容过滤 (dreamFundId/fund_id/fundId)
 * - amount 三键回退 (savedAmount→amount→refundAmount→0)
 * - 查询失败 → 500
 */
describe('GET dream-funds/history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('缺 fundId → 400', async () => {
    const args = makeArgs([]);
    args.params = { fundId: '' };
    const r = (await (GET as unknown as (a: unknown) => Promise<Response>)(args)) as Response;
    expect(r.status).toBe(400);
  });

  it('三键兼容过滤: dreamFundId/fund_id/fundId 命中; 其他基金/无 metadata 排除', async () => {
    const rows = [
      { id: 'a', event_type: 'challenge_completed', description: 'd1', created_at: 't1', trigger_source: 's', metadata: { dreamFundId: 'df-9', savedAmount: 50 } },
      { id: 'b', event_type: 'challenge_reward', description: 'd2', created_at: 't2', trigger_source: 's', metadata: { fund_id: 'df-9', amount: 30 } },
      { id: 'c', event_type: 'refund_boost', description: 'd3', created_at: 't3', trigger_source: 's', metadata: { fundId: 'df-9', refundAmount: 12 } },
      { id: 'x', event_type: 'challenge_completed', description: 'other', created_at: 't4', trigger_source: 's', metadata: { dreamFundId: 'df-other' } }, // 别的基金
      { id: 'y', event_type: 'refund_boost', description: 'nometa', created_at: 't5', trigger_source: 's', metadata: null }, // 无 metadata
    ];
    const r = (await (GET as unknown as (a: unknown) => Promise<Response>)(makeArgs(rows))) as Response;
    const body = await r.json();
    expect(body.history).toHaveLength(3);
    expect(body.history.map((h: { id: string }) => h.id)).toEqual(['a', 'b', 'c']);
    expect(body.history[0].amount).toBe(50); // savedAmount
    expect(body.history[1].amount).toBe(30); // amount
    expect(body.history[2].amount).toBe(12); // refundAmount
  });

  it('查询失败 → 500', async () => {
    const r = (await (GET as unknown as (a: unknown) => Promise<Response>)(makeArgs([], { message: 'rls' }))) as Response;
    expect(r.status).toBe(500);
  });

  it('查询链形状: user 隔离+类型过滤+倒序+limit 100', async () => {
    const args = makeArgs([]);
    await (GET as unknown as (a: unknown) => Promise<Response>)(args);
    const c = args.chain as Record<string, ReturnType<typeof vi.fn>>;
    expect(c.eq).toHaveBeenCalledWith('user_id', 'u1');
    expect(c.in).toHaveBeenCalledWith('event_type', ['challenge_completed', 'challenge_reward', 'refund_boost']);
    expect(c.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(c.limit).toHaveBeenCalledWith(100);
  });
});
