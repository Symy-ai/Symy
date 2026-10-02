/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// user/display-name — 昵称双写（此前 0 测试）
// 契约: profiles表更新(主源)+auth user_metadata更新(客户端即读);
// 第二步失败非致命(warning降级); 第一步失败500。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let authContext: { supabase: unknown; user: { id: string }; request: NextRequest };
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: typeof authContext) => Promise<unknown>) =>
    async (_req: NextRequest) => handler(authContext),
}));

const updateMock = vi.fn(); // profiles.update
const updateUserMock = vi.fn(); // auth.updateUser
const fakeSupabase = {
  from: (t: string) => {
    expect(t).toBe('profiles');
    return { update: (patch: Record<string, unknown>) => {
      expect(typeof patch.display_name).toBe('string');
      expect(typeof patch.updated_at).toBe('string');
      return { eq: (_c: string, uid: string) => updateMock(uid) };
    } };
  },
  auth: { updateUser: updateUserMock },
};

import { POST } from '../route';

function ctx(body: unknown) {
  const request = new NextRequest('http://localhost/api/user/display-name', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  authContext = { supabase: fakeSupabase, user: { id: 'u-1' }, request };
  return request;
}

describe('POST /api/user/display-name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });
  });

  it('双写成功 → success+displayName', async () => {
    const res = await POST(ctx({ displayName: '小象骑士' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.displayName).toBe('小象骑士');
    expect(updateMock).toHaveBeenCalledWith('u-1');
    expect(updateUserMock).toHaveBeenCalledWith({ data: { full_name: '小象骑士' } });
  });

  it('profiles 更新失败 → 500 (auth 更新不执行)', async () => {
    updateMock.mockResolvedValue({ error: { message: 'rls denied' } });
    const res = await POST(ctx({ displayName: 'x' }));
    expect(res.status).toBe(500);
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('user_metadata 失败 → 降级 success+warning (非致命)', async () => {
    updateUserMock.mockResolvedValue({ error: { message: 'auth svc down' } });
    const res = await POST(ctx({ displayName: 'y' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.warning).toBe('string');
  });
});
