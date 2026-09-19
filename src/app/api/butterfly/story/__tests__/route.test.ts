/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * POST /api/butterfly/story — 分布式锁释放契约（batch91-a）
 *
 * 缺陷背景：acquireLock(120s TTL) 后多处 early-return 不释放锁 → 同 session
 * 重试最长 2 分钟全部 409。本文件钉死契约：每条锁后 early-return 路径必须
 * releaseLock 恰一次；锁语义（键名 `butterfly-story:<sessionId>`、TTL 120s）
 * 不变。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Use a mutable object — vi.mock closure captures this reference
const mockState = {
  user: { id: 'user-123' } as { id: string } | null,
  supabase: null as unknown,
};

vi.mock('@/lib/with-auth', () => ({
  withAuth: (handler: (ctx: { request: NextRequest; user: { id: string }; supabase: unknown }) => Promise<Response>) => {
    return async (request: NextRequest) => { // eslint-disable-next-line require-await
      if (!mockState.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return handler({ request, user: mockState.user, supabase: mockState.supabase });
    };
  },
}));

vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  acquireLock: vi.fn(async () => true),
  releaseLock: vi.fn(async () => {}),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/features/butterfly/lib/story-engine', () => ({
  isStoryEngineReady: vi.fn(() => true),
}));

vi.mock('@/features/butterfly/lib/engine', () => ({
  CHOICE_CHAPTER_INDICES: [2],
}));

vi.mock('../parts/early-return', () => ({
  handleStoryCompleteEarlyReturn: vi.fn(async () => ({
    response: NextResponse.json({ error: 'story complete' }, { status: 200 }),
  })),
}));

vi.mock('../parts/stream-chapter', () => ({
  streamStoryChapter: vi.fn(async () => {}),
}));

vi.mock('../parts/stream-all-story', () => ({
  streamAllStory: vi.fn(async () => {}),
  getPreloadedChapter3: vi.fn(() => null),
}));

import { POST } from '../route';
import { acquireLock, releaseLock } from '@/lib/distributed-lock';
import { isStoryEngineReady } from '@/features/butterfly/lib/story-engine';

const SESSION_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const LOCK_KEY = `butterfly-story:${SESSION_ID}`;

function sessionRowFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    user_id: 'user-123',
    decision_type: 'inducement',
    decision_description: 'limited-time course upsell',
    amount: 199,
    platform: null,
    context: null,
    outline: {
      version: 1,
      chapters: [
        { index: 1, title: 'The Message', hasChoice: false },
        { index: 2, title: 'Crossroads', hasChoice: true },
      ],
      endingHint: null,
    },
    current_chapter: 0,
    chapters: [],
    choices: [],
    butterfly_effect: null,
    final_tone: null,
    status: 'active',
    created_at: '2026-09-19T00:00:00Z',
    updated_at: '2026-09-19T00:00:00Z',
    ...overrides,
  };
}

/**
 * butterfly_sessions 的 maybeSingle 按队列逐个弹出结果（首查 → fresh 重读）；
 * profiles 等其它表返回空。
 */
function authedMock(sessionResults: Array<{ data: unknown; error?: unknown }>) {
  const queue = [...sessionResults];
  const fakeSupabase = {
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (table === 'butterfly_sessions') {
            return queue.shift() ?? { data: null, error: null };
          }
          return { data: null, error: null };
        }),
      };
      return chain;
    }),
  };
  mockState.user = { id: 'user-123' };
  mockState.supabase = fakeSupabase;
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/butterfly/story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: SESSION_ID }),
  });
}

describe('POST /api/butterfly/story — lock release contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStoryEngineReady).mockReturnValue(true);
    mockState.user = { id: 'user-123' };
    mockState.supabase = null;
  });

  it('acquires the session lock with key butterfly-story:<sessionId> and TTL 120s', async () => {
    authedMock([{ data: sessionRowFixture() }]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(acquireLock).toHaveBeenCalledWith(LOCK_KEY, 120_000, true);
  });

  it('releases lock once when outline is missing (pre-existing release path)', async () => {
    authedMock([{ data: sessionRowFixture({ outline: null }) }]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Session outline not ready yet' });
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('releases lock once when session status is not active (409 leak ①)', async () => {
    authedMock([{ data: sessionRowFixture({ status: 'completed' }) }]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Session is not active yet' });
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('releases lock once when story engine is not ready (503 leak ②)', async () => {
    authedMock([{ data: sessionRowFixture() }]);
    vi.mocked(isStoryEngineReady).mockReturnValue(false);
    const res = await POST(makeRequest());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Story engine is not available. Please try again later.' });
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('releases lock once when fresh read shows inactive session (400 leak ③a)', async () => {
    const initial = sessionRowFixture();
    authedMock([
      { data: initial },
      { data: sessionRowFixture({ status: 'completed', updated_at: '2026-09-19T01:00:00Z' }) },
    ]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Session is not active' });
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('releases lock once when fresh read shows missing outline (400 leak ③b)', async () => {
    const initial = sessionRowFixture();
    authedMock([
      { data: initial },
      { data: sessionRowFixture({ outline: null, updated_at: '2026-09-19T01:00:00Z' }) },
    ]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Session has no outline' });
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('does not release when the lock was never acquired (409 contention path)', async () => {
    authedMock([{ data: sessionRowFixture() }]);
    vi.mocked(acquireLock).mockResolvedValueOnce(false);
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Story generation already in progress for this session. Please wait.',
    });
    expect(releaseLock).not.toHaveBeenCalled();
  });

  it('releases lock exactly once on the normal streaming path', async () => {
    const row = sessionRowFixture();
    authedMock([{ data: row }, { data: row }]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    // start() runs eagerly; the stream body stays open (mocked parts don't close
    // the controller) — wait for the finally-block release, then drop the body.
    await vi.waitFor(() => expect(releaseLock).toHaveBeenCalledTimes(1));
    await res.body?.cancel();
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });
});
