/* eslint-disable require-await -- withAuth 直通 mock 的 async 直返 */
// community/challenges/checkin — 周挑战签到（此前 0 测试）
// 契约: 未加入404/已完成幂等/未开始400(R107)/今天已签幂等/
// CAS并发防跳天(P0-3)/7天自动completed。
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
      // safe to ignore: malformed JSON → null → isValidationError 400
      return null;
    }
  },
  isValidationError: (v: unknown) => v === null,
}));

const participantMock = vi.fn();
const challengeMock = vi.fn();
const updateMock = vi.fn();
let lastOrClause = '';
const fakeSupabase = {
  from: (t: string) => {
    if (t === 'challenge_participants') {
      return {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: participantMock }) }) }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            or: (clause: string) => {
              lastOrClause = clause;
              void patch;
              return { select: () => ({ maybeSingle: updateMock }) };
            },
          }),
        }),
      };
    }
    if (t === 'community_challenges') {
      return { select: () => ({ eq: () => ({ maybeSingle: challengeMock }) }) };
    }
    throw new Error('unexpected ' + t);
  },
};

import { POST } from '../route';

function ctx(body: unknown) {
  const request = new NextRequest('http://localhost/api/community/challenges/checkin', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  authContext = { supabase: fakeSupabase, user: { id: 'u-1' }, request };
  return request;
}

function activeChallenge() {
  const start = new Date(Date.now() - 86400000).toISOString();
  const end = new Date(Date.now() + 86400000).toISOString();
  challengeMock.mockResolvedValue({ data: { start_date: start, end_date: end }, error: null });
}

describe('POST /api/community/challenges/checkin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeChallenge();
    participantMock.mockResolvedValue({
      data: { id: 'p1', status: 'active', current_day: 2, last_checkin_date: null },
      error: null,
    });
    updateMock.mockResolvedValue({ data: { current_day: 3, status: 'active' }, error: null });
  });

  it('未加入 → 404', async () => {
    participantMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(404);
  });

  it('已完成 → 幂等 200 Already completed', async () => {
    participantMock.mockResolvedValue({
      data: { id: 'p1', status: 'completed', current_day: 7, last_checkin_date: 'x' },
      error: null,
    });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Already completed');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('挑战未开始 → 400 (Round 107)', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    challengeMock.mockResolvedValue({ data: { start_date: tomorrow, end_date: tomorrow }, error: null });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(400);
  });

  it('今天已签 → 幂等 200', async () => {
    const today = new Date().toISOString().split('T')[0];
    participantMock.mockResolvedValue({
      data: { id: 'p1', status: 'active', current_day: 3, last_checkin_date: today },
      error: null,
    });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe('Already checked in today');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('CAS or 子句包含 null 分支 (P0-3: SQL三值逻辑)', async () => {
    await POST(ctx({ challengeId: 'c1' }));
    expect(lastOrClause).toMatch(/last_checkin_date\.is\.null/);
    expect(lastOrClause).toMatch(/last_checkin_date\.neq\./);
  });

  it('CAS 失败(并发已签) → 幂等 200 不跳天', async () => {
    updateMock.mockResolvedValue({ data: null, error: null });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Already checked in today');
    expect(body.currentDay).toBe(2); // 保持旧值不 +1
  });

  it('第7天签到 → status 自动 completed', async () => {
    participantMock.mockResolvedValue({
      data: { id: 'p1', status: 'active', current_day: 6, last_checkin_date: null },
      error: null,
    });
    updateMock.mockResolvedValue({ data: { current_day: 7, status: 'completed' }, error: null });
    const res = await POST(ctx({ challengeId: 'c1' }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('completed');
  });
});
