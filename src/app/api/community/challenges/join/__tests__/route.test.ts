/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// community/challenges/join — 加入周挑战（此前 0 测试）
// 契约: 挑战不存在404/不活跃400/已加入幂等200/UNIQUE并发
// 冲突23505→重读返回200(ARCH-3修复)/普通insert错误500。
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
vi.mock('@/lib/api-validation', () => ({
  validateBody: async (req: NextRequest) => {
    try { return await req.json(); } catch {
      // safe to ignore: malformed JSON → null (isValidationError 判定 400)
      return null;
    }
  },
  isValidationError: (v: unknown) => v === null,
}));

const challengeMock = vi.fn();
const existingMock = vi.fn();
const insertMock = vi.fn();
const fakeSupabase = {
  from: (t: string) => {
    if (t === 'community_challenges') {
      return { select: () => ({ eq: () => ({ maybeSingle: challengeMock }) }) };
    }
    if (t === 'challenge_participants') {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: existingMock }) }) }),
        insert: () => ({ select: () => ({ single: insertMock }) }),
      };
    }
    throw new Error('unexpected ' + t);
  },
};

import { POST } from '../route';

function ctx(body: unknown) {
  const request = new NextRequest('http://localhost/api/community/challenges/join', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  authContext = { supabase: fakeSupabase, user: { id: 'u-1' }, request };
  return request;
}

describe('POST /api/community/challenges/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    challengeMock.mockResolvedValue({ data: { id: 'c1', is_active: true }, error: null });
    existingMock.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ data: { id: 'p1', status: 'active', current_day: 0 }, error: null });
  });

  it('挑战不存在 → 404', async () => {
    challengeMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(ctx({ challengeId: 'gone' }));
    expect(res.status).toBe(404);
  });

  it('挑战不活跃 → 400', async () => {
    challengeMock.mockResolvedValue({ data: { id: 'c1', is_active: false }, error: null });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(400);
  });

  it('已加入 → 幂等 200 Already joined (不重复插入)', async () => {
    existingMock.mockResolvedValue({ data: { id: 'p-exist', status: 'active', current_day: 3 }, error: null });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Already joined');
    expect(body.participant.current_day).toBe(3);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('UNIQUE 23505 并发冲突 → 重读返回 200 (ARCH-3 非500)', async () => {
    // existing 读 null, 但 insert 撞 UNIQUE (并发双击)
    insertMock.mockResolvedValue({ data: null, error: { code: '23505', message: 'dup' } });
    existingMock.mockResolvedValue({ data: { id: 'p-race', status: 'active', current_day: 0 }, error: null });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Already joined');
    expect(body.participant.id).toBe('p-race');
  });

  it('普通 insert 错误 → 500', async () => {
    insertMock.mockResolvedValue({ data: null, error: { code: '23503', message: 'fk' } });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(500);
  });

  it('正常加入 → 200 participant', async () => {
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.participant.id).toBe('p1');
  });
});
