/* eslint-disable require-await -- test mocks use async for API consistency */
// challenge/stats route (46行) — 用户挑战统计 (P1-3 "You saw" 计数修复, Round 90)。
// 锁定: withAuth 包装 / passed+failed 两查询聚合 / 任一查询失败 → 500。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mockState = {
  user: { id: 'user-123' } as { id: string } | null,
  supabase: null as unknown,
};

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; user: { id: string }; supabase: unknown }) => Promise<NextResponse>) => {
    return async (request: NextRequest) => {
      if (!mockState.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return handler({ request, user: mockState.user, supabase: mockState.supabase });
    };
  },
}));

import { GET } from '../route';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/challenge/stats', { method: 'GET' });
}

/** 链式 mock: from('active_challenges').select(...).eq().eq() → {count, error}
 *  passed/failed 两查询按 status 值分流 */
function makeSupabase(passed: { count: number | null; error: unknown }, failed: { count: number | null; error: unknown }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn((_: string, status: string) => ({
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(status === 'passed' ? passed : failed).then(resolve),
          })),
        })),
      })),
    })),
  };
}

describe('GET /api/challenge/stats', () => {
  beforeEach(() => {
    mockState.user = { id: 'user-123' };
    mockState.supabase = null;
  });

  it('passed 3 + failed 2 → totalSaw 5 (聚合不受 Clear 影响)', async () => {
    mockState.supabase = makeSupabase({ count: 3, error: null }, { count: 2, error: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ totalSaw: 5, totalPassed: 3, totalFailed: 2 });
  });

  it('两查询均 0 → totalSaw 0 (count null 回退)', async () => {
    mockState.supabase = makeSupabase({ count: null, error: null }, { count: null, error: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ totalSaw: 0, totalPassed: 0, totalFailed: 0 });
  });

  it('passed 查询失败 → 500 (不泄漏 error 细节)', async () => {
    mockState.supabase = makeSupabase({ count: null, error: { message: 'rls denied', code: '42501' } }, { count: 1, error: null });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to fetch challenge stats');
    expect(JSON.stringify(body)).not.toContain('rls denied');
  });

  it('failed 查询失败 → 500 (passed 成功也不放行)', async () => {
    mockState.supabase = makeSupabase({ count: 5, error: null }, { count: null, error: { message: 'connection reset' } });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to fetch challenge stats');
  });
});
