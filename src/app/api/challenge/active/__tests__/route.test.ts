// challenge routes — 挑战查询端点（此前 0 测试）
// active: getActiveChallenge 委托; stats: passed/failed 计数聚合。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// --- withAuth mock: 直传 handler 需要的上下文 ---
let authContext: { supabase: unknown; user: { id: string } };
let authError: { status: number; body: unknown } | null = null;
/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { supabase: unknown; user: { id: string } }) => Promise<unknown>) =>
    async (_req: NextRequest) => {
      if (authError) return NextResponse.json(authError.body, { status: authError.status });
      return handler(authContext);
    },
}));

const getActiveChallengeMock = vi.fn();
vi.mock('@/lib/challenge-store', () => ({
  getActiveChallenge: (...a: unknown[]) => getActiveChallengeMock(...a),
}));

const countSelectMock = vi.fn(); // (status) => Promise<{count,error}>
const fakeSupabase = {
  from: (table: string) => {
    if (table !== 'active_challenges') throw new Error('unexpected table ' + table);
    return {
      select: (cols: string, opts?: Record<string, unknown>) => {
        expect(cols).toBe('id');
        expect(opts?.count).toBe('exact');
        expect(opts?.head).toBe(true);
        return {
          eq: (_c: string, _v: string) => ({
            eq: (_c2: string, status: string) => countSelectMock(status),
          }),
        };
      },
    };
  },
};

import { GET as getActive } from '../route';
import { GET as getStats } from '../../stats/route';

function req() {
  return new NextRequest('http://localhost/api/challenge/active');
}

describe('GET /api/challenge/active', () => {
  beforeEach(() => { authError = null; authContext = { supabase: fakeSupabase, user: { id: 'u-1' } }; });

  it('有活跃挑战 → 返回 challenge 对象', async () => {
    getActiveChallengeMock.mockResolvedValue({ success: true, challenge: { id: 'ch-1', item: '耳机' } });
    const res = await getActive(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge.id).toBe('ch-1');
    expect(getActiveChallengeMock).toHaveBeenCalledWith('u-1');
  });

  it('无挑战 → challenge null (200 非404)', async () => {
    getActiveChallengeMock.mockResolvedValue({ success: true, challenge: null });
    const res = await getActive(req());
    expect(res.status).toBe(200);
    expect((await res.json()).challenge).toBeNull();
  });

  it('store 失败 → 500 带error', async () => {
    getActiveChallengeMock.mockResolvedValue({ success: false, error: 'db down' });
    const res = await getActive(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('db down');
  });
});

describe('GET /api/challenge/stats', () => {
  beforeEach(() => { authError = null; authContext = { supabase: fakeSupabase, user: { id: 'u-1' } }; });

  it('passed/failed 计数聚合 → totalSaw 求和', async () => {
    countSelectMock.mockImplementation((status: string) =>
      Promise.resolve(status === 'passed' ? { count: 12, error: null } : { count: 3, error: null }),
    );
    const res = await getStats(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ totalSaw: 15, totalPassed: 12, totalFailed: 3 });
  });

  it('查询失败 → 500', async () => {
    countSelectMock.mockResolvedValue({ count: null, error: { message: 'boom' } }); // 两次任一失败即500
    const res = await getStats(req());
    expect(res.status).toBe(500);
  });
});
