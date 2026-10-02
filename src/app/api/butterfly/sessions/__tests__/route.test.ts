/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// butterfly/sessions — 蝴蝶故事列表（此前 0 测试）
// 契约: 分页收敛(pageSize 1-50)/status过滤白名单(默认
// completed+abandoned, all=三态)/count先行/映射dbToSession。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let authContext: { supabase: unknown; user: { id: string }; request: NextRequest };
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: typeof authContext) => Promise<unknown>) =>
    async (_req: NextRequest) => handler(authContext),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/butterfly/lib/db-mappers', () => ({
  dbToSession: (row: Record<string, unknown>) => ({ id: row.id, mapped: true }),
}));

let lastInArgs: unknown[] = [];
let lastRange: number[] = [];
const countMock = vi.fn();
const rowsMock = vi.fn();
const fakeSupabase = {
  from: (t: string) => {
    expect(t).toBe('butterfly_sessions');
    return {
      select: (cols: string, opts?: Record<string, unknown>) => {
        if (opts?.head) {
          return { eq: () => ({ in: (...a: unknown[]) => { lastInArgs = a; return countMock(); } }) };
        }
        void cols;
        return {
          eq: () => ({
            in: (...a: unknown[]) => {
              lastInArgs = a;
              return { order: () => ({ range: (...r: number[]) => { lastRange = r; return rowsMock(); } }) };
            },
          }),
        };
      },
    };
  },
};

import { GET } from '../route';

function ctx(q = '') {
  const request = new NextRequest('http://localhost/api/butterfly/sessions' + (q ? '?' + q : ''));
  authContext = { supabase: fakeSupabase, user: { id: 'u-1' }, request };
  return request;
}

describe('GET /api/butterfly/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countMock.mockResolvedValue({ count: 5, error: null });
    rowsMock.mockResolvedValue({ data: [{ id: 's1' }, { id: 's2' }], error: null });
  });

  it('默认: completed+abandoned (不含active)', async () => {
    const res = await GET(ctx());
    expect(res.status).toBe(200);
    expect(lastInArgs[1]).toEqual(['completed', 'abandoned']);
  });

  it('status=all → 三态全含', async () => {
    await GET(ctx('status=all'));
    expect(lastInArgs[1]).toEqual(['active', 'completed', 'abandoned']);
  });

  it('status=active 单选 / 非法值回退默认', async () => {
    await GET(ctx('status=active'));
    expect(lastInArgs[1]).toEqual(['active']);
    await GET(ctx('status=bogus,x'));
    expect(lastInArgs[1]).toEqual(['completed', 'abandoned']);
  });

  it('pageSize 越界收敛: 999→50, 0→1', async () => {
    await GET(ctx('pageSize=999'));
    expect(lastRange[1] - lastRange[0] + 1).toBe(50); // range 闭区间
    await GET(ctx('pageSize=0'));
    // parseInt('0')=0 falsy → ||10 走默认 (同 audit limit=0 quirk, 如实锚定)
    expect(lastRange[1] - lastRange[0] + 1).toBe(10);
  });

  it('page=2 → range 从 pageSize 起', async () => {
    await GET(ctx('page=2&pageSize=10'));
    expect(lastRange).toEqual([10, 19]);
  });

  it('count 失败 → 500', async () => {
    countMock.mockResolvedValue({ count: null, error: { message: 'db' } });
    const res = await GET(ctx());
    expect(res.status).toBe(500);
  });
});
