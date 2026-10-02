/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// letta/agent — 用户Agent管理（此前 0 测试）
// 契约: status查询/create已有409/create失败不泄露配置(ARCH-8#25)/
// ensure默认幂等返回isNewPerUser。
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let authContext: { supabase: unknown; user: { id: string; email?: string }; request: NextRequest };
vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: typeof authContext) => Promise<unknown>) =>
    async (_req: NextRequest) => handler(authContext),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/api-validation', () => ({
  validateBody: async (req: NextRequest) => {
    try { return await req.json(); } catch {
      // safe to ignore: malformed JSON → null → 400
      return null;
    }
  },
  isValidationError: (v: unknown) => v === null,
}));
const getUserAgentIdMock = vi.fn();
const createAgentForUserMock = vi.fn();
const getOrCreateAgentIdMock = vi.fn();
vi.mock('@/lib/letta-agent-manager', () => ({
  getUserAgentId: (...a: unknown[]) => getUserAgentIdMock(...a),
  createAgentForUser: (...a: unknown[]) => createAgentForUserMock(...a),
  getOrCreateAgentId: (...a: unknown[]) => getOrCreateAgentIdMock(...a),
}));

import { POST, GET } from '../route';

function ctx(body: unknown) {
  const request = new NextRequest('http://localhost/api/letta/agent', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  authContext = { supabase: {}, user: { id: 'u-1', email: 'x@y.z' }, request };
  return request;
}

describe('POST /api/letta/agent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('status: 无agent → hasAgent false', async () => {
    getUserAgentIdMock.mockResolvedValue(null);
    const res = await POST(ctx({ action: 'status' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasAgent: false, agentId: null });
  });

  it('create: 已有agent → 409 带 existingAgentId', async () => {
    getUserAgentIdMock.mockResolvedValue('agent-old');
    const res = await POST(ctx({ action: 'create' }));
    expect(res.status).toBe(409);
    expect((await res.json()).existingAgentId).toBe('agent-old');
    expect(createAgentForUserMock).not.toHaveBeenCalled();
  });

  it('create: 失败 → 500 且不泄露配置/内部错误 (ARCH-8#25)', async () => {
    getUserAgentIdMock.mockResolvedValue(null);
    createAgentForUserMock.mockRejectedValue(new Error('LETTA_API_KEY missing + internal path /srv/x'));
    const res = await POST(ctx({ action: 'create' }));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('LETTA');
    expect(text).not.toContain('/srv');
    expect(text).toContain('try again later');
  });

  it('create: 成功 → agentId 返回', async () => {
    getUserAgentIdMock.mockResolvedValue(null);
    createAgentForUserMock.mockResolvedValue('agent-new');
    const res = await POST(ctx({ action: 'create' }));
    expect(res.status).toBe(200);
    expect((await res.json()).agentId).toBe('agent-new');
  });

  it('ensure(默认): 已有 → isNewPerUser false', async () => {
    getUserAgentIdMock.mockResolvedValue('agent-exist');
    getOrCreateAgentIdMock.mockResolvedValue('agent-exist');
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect((await res.json()).isNewPerUser).toBe(false);
  });

  it('ensure: 新建 → isNewPerUser true', async () => {
    getUserAgentIdMock.mockResolvedValue(null);
    getOrCreateAgentIdMock.mockResolvedValue('agent-fresh');
    const res = await POST(ctx({}));
    expect(res.status).toBe(200);
    expect((await res.json()).isNewPerUser).toBe(true);
  });
});

describe('GET /api/letta/agent', () => {
  it('查询 → hasAgent + agentId', async () => {
    getUserAgentIdMock.mockResolvedValue('agent-x');
    authContext = { supabase: {}, user: { id: 'u-1' }, request: new NextRequest('http://localhost/api/letta/agent') };
    const res = await GET(authContext.request);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasAgent: true, agentId: 'agent-x' });
  });
});
