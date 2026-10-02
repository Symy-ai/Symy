/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// challenge/expired — 最近过期挑战（此前 0 测试）
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let authContext: { supabase: unknown; user: { id: string }; request: NextRequest };
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: typeof authContext) => Promise<unknown>) =>
    async (_req: NextRequest) => handler(authContext),
}));

const getRecentExpiredMock = vi.fn();
vi.mock('@/lib/challenge-store', () => ({
  getRecentExpiredChallenge: (...a: unknown[]) => getRecentExpiredMock(...a),
}));

import { GET } from '../route';

describe('GET /api/challenge/expired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authContext = { supabase: {}, user: { id: 'u-1' }, request: new NextRequest('http://localhost/api/challenge/expired') };
  });

  it('有过期挑战 → 返回对象', async () => {
    getRecentExpiredMock.mockResolvedValue({ success: true, challenge: { id: 'ex-1', status: 'expired' } });
    const res = await GET(authContext.request);
    expect(res.status).toBe(200);
    expect((await res.json()).challenge.id).toBe('ex-1');
    expect(getRecentExpiredMock).toHaveBeenCalledWith('u-1');
  });

  it('无过期挑战 → 200 + null (恢复提醒不显示)', async () => {
    getRecentExpiredMock.mockResolvedValue({ success: true, challenge: null });
    const res = await GET(authContext.request);
    expect(res.status).toBe(200);
    expect((await res.json()).challenge).toBeNull();
  });

  it('store 失败 → 500 带 error', async () => {
    getRecentExpiredMock.mockResolvedValue({ success: false, error: 'db boom' });
    const res = await GET(authContext.request);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('db boom');
  });
});
