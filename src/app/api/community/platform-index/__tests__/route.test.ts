import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/with-auth', () => ({
  // identity 透传 (R361 定案)
  withAuth: (fn: (args: unknown) => unknown, _opts?: unknown) => fn,
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { GET } from '../route';

function makeArgs(rows: unknown[], error: unknown = null) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data: rows, error })),
  };
  return { supabase: { from: () => chain }, chain };
}

/**
 * community/platform-index route (79行) — 平台诱导指数 (Round 100 withAuth 迁移)。
 *
 * 锁定:
 * - 已知平台 → label/icon 装配; 未知平台 → 原名+🏪
 * - unknown 平台过滤; index/计数/金额 Number 窄化
 * - 视图未迁移/异常 → 空数组+hasData false
 * - 查询形状: inducement_index 倒序+limit 8
 */
describe('GET /api/community/platform-index', () => {
  beforeEach(() => vi.clearAllMocks());

  it('已知平台 label/icon 装配+未知平台兜底', async () => {
    const rows = [
      { platform: 'tiktok_shop', inducement_index: 87, failed_count: 12, passed_count: 30, total_saved: 450 },
      { platform: 'weird_new_app', inducement_index: 60, failed_count: 1, passed_count: 2, total_saved: 30 },
    ];
    const r = (await GET(makeArgs(rows) as never)) as Response;
    const body = await r.json();
    expect(body.hasData).toBe(true);
    expect(body.platforms[0]).toEqual({
      platform: 'tiktok_shop', label: 'TikTok Shop', icon: '📱',
      index: 87, failedCount: 12, passedCount: 30, totalSaved: 450,
    });
    expect(body.platforms[1].label).toBe('weird_new_app'); // 未知平台原名
    expect(body.platforms[1].icon).toBe('🏪'); // 兜底图标
  });

  it('unknown 平台被过滤', async () => {
    const r = (await GET(makeArgs([
      { platform: 'unknown', inducement_index: 99, failed_count: 9, passed_count: 9, total_saved: 9 },
      { platform: 'amazon', inducement_index: 40, failed_count: 1, passed_count: 5, total_saved: 100 },
    ]) as never)) as Response;
    const body = await r.json();
    expect(body.platforms).toHaveLength(1);
    expect(body.platforms[0].platform).toBe('amazon');
  });

  it('视图未迁移 (error) → 空数组+hasData false', async () => {
    const r = (await GET(makeArgs([], { message: 'relation missing' }) as never)) as Response;
    expect(await r.json()).toEqual({ platforms: [], hasData: false });
  });

  it('空 data → hasData false', async () => {
    const r = (await GET(makeArgs([]) as never)) as Response;
    expect((await r.json()).hasData).toBe(false);
  });

  it('意外异常 → catch 空数组', async () => {
    const r = (await GET({ supabase: { from: () => { throw new Error('boom'); } } } as never)) as Response;
    expect(await r.json()).toEqual({ platforms: [], hasData: false });
  });

  it('查询形状: inducement_index 倒序+limit 8', async () => {
    const args = makeArgs([]);
    await GET(args as never);
    const c = args.chain as Record<string, ReturnType<typeof vi.fn>>;
    expect(c.order).toHaveBeenCalledWith('inducement_index', { ascending: false });
    expect(c.limit).toHaveBeenCalledWith(8);
  });
});
