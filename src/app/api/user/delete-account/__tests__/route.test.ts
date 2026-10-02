/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// user/delete-account — 销号级联（此前 0 测试, 危险操作面）
// 契约: confirm字面量"DELETE"防误删; Letta/Storage失败非阻塞继续;
// admin deleteUser 失败500; 成功=级联清除。
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
const adminDeleteUserMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => ({ supabase: { auth: { admin: { deleteUser: adminDeleteUserMock } } } }),
}));
const lettaAgentsDeleteMock = vi.fn();
vi.mock('@/lib/letta-mcp-manager', () => ({
  getLettaClient: () => ({ agents: { delete: lettaAgentsDeleteMock } }),
}));

const maybeSingleMock = vi.fn();
const storageListMock = vi.fn();
const storageRemoveMock = vi.fn();
const fakeSupabase = {
  from: (t: string) => {
    expect(t).toBe('profiles');
    return { select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }) };
  },
  storage: {
    from: (b: string) => {
      expect(b).toBe('avatars');
      return { list: storageListMock, remove: storageRemoveMock };
    },
  },
};

import { POST } from '../route';

function ctx(body: unknown) {
  const request = new NextRequest('http://localhost/api/user/delete-account', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  authContext = { supabase: fakeSupabase, user: { id: 'u-del' }, request };
  return request;
}

describe('POST /api/user/delete-account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingleMock.mockResolvedValue({ data: { letta_agent_id: 'agent-1' }, error: null });
    lettaAgentsDeleteMock.mockResolvedValue(undefined);
    storageListMock.mockResolvedValue({ data: [{ name: 'a.png' }, { name: 'b.png' }], error: null });
    storageRemoveMock.mockResolvedValue({ error: null });
    adminDeleteUserMock.mockResolvedValue({ error: null });
  });

  it('全链成功: Letta→Storage→admin级联→success', async () => {
    const res = await POST(ctx({ confirm: 'DELETE' }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(lettaAgentsDeleteMock).toHaveBeenCalledWith('agent-1');
    expect(storageRemoveMock).toHaveBeenCalledWith(['u-del/a.png', 'u-del/b.png']);
    expect(adminDeleteUserMock).toHaveBeenCalledWith('u-del');
  });

  it('confirm 非 "DELETE" → 400 (防误删护栏)', async () => {
    const res = await POST(ctx({ confirm: 'delete' }));
    expect(res.status).toBe(400);
    expect(adminDeleteUserMock).not.toHaveBeenCalled();
  });

  it('Letta 失败非阻塞 → 仍继续级联删除', async () => {
    lettaAgentsDeleteMock.mockRejectedValue(new Error('letta down'));
    const res = await POST(ctx({ confirm: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(adminDeleteUserMock).toHaveBeenCalled();
  });

  it('Storage 失败非阻塞 → 仍删除账号', async () => {
    storageListMock.mockRejectedValue(new Error('storage down'));
    const res = await POST(ctx({ confirm: 'DELETE' }));
    expect(res.status).toBe(200);
  });

  it('admin deleteUser 失败 → 500', async () => {
    adminDeleteUserMock.mockResolvedValue({ error: { message: 'fk constraint' } });
    const res = await POST(ctx({ confirm: 'DELETE' }));
    expect(res.status).toBe(500);
  });

  it('无 letta_agent_id → 跳过 Letta 删除', async () => {
    maybeSingleMock.mockResolvedValue({ data: { letta_agent_id: null }, error: null });
    await POST(ctx({ confirm: 'DELETE' }));
    expect(lettaAgentsDeleteMock).not.toHaveBeenCalled();
    expect(adminDeleteUserMock).toHaveBeenCalled();
  });
});
