/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// reflections/resonate — 反思共鸣投票（此前 0 测试）
// 契约: zod uuid校验/日投票限200(429)/RPC失败400/成功ok+created。
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

const rpcMock = vi.fn();
const votesCountMock = vi.fn();
const fakeSupabase = {
  from: (t: string) => {
    expect(t).toBe('daily_reflection_votes');
    return {
      select: () => ({
        eq: () => ({
          gte: () => votesCountMock(),
        }),
      }),
    };
  },
  rpc: rpcMock,
};

import { POST } from '../route';

function makeCtx(body: unknown) {
  const req = new NextRequest('http://localhost/api/reflections/resonate', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  authContext = { supabase: fakeSupabase, user: { id: 'u-1' }, request: req };
  return req;
}

describe('POST /api/reflections/resonate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    votesCountMock.mockResolvedValue({ count: 5, error: null });
    rpcMock.mockResolvedValue({ data: true, error: null });
  });

  it('合法 uuid → 投票成功 ok+created', async () => {
    const res = await POST(makeCtx({ id: '123e4567-e89b-12d3-a456-426614174000' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.created).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('increment_resonates', { target: '123e4567-e89b-12d3-a456-426614174000' });
  });

  it('非法 uuid → 400 zod issues', async () => {
    const res = await POST(makeCtx({ id: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation failed');
  });

  it('非 JSON body → 400 Invalid JSON', async () => {
    const res = await POST(makeCtx('{{{'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid JSON');
  });

  it('日投票超 200 → 429 rate_limited (RPC 不被调)', async () => {
    votesCountMock.mockResolvedValue({ count: 201, error: null });
    const res = await POST(makeCtx({ id: '123e4567-e89b-12d3-a456-426614174000' }));
    expect(res.status).toBe(429);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('RPC 失败 → 400 internal_error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'rpc boom' } });
    const res = await POST(makeCtx({ id: '123e4567-e89b-12d3-a456-426614174000' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('internal_error');
  });
});
