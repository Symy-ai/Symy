/* eslint-disable require-await -- test mocks use async for API consistency */
/**
 * POST /api/butterfly/preload-branch — 幂等锁 + abort 契约（batch92-b，D8）
 *
 * 缺陷背景：最贵端点（每次 2-3 条 LLM 流）无幂等锁，同 session 并发 preload
 * 双击即双倍成本；abort 监听注册前未检 signal.aborted，请求已断开仍启上游流。
 * 本文件钉死契约：
 *  1. 锁语义：键 `preload:<sessionId>`、TTL 90s、fail-closed；第二发并发 409。
 *  2. abort：已断开请求 → 499 / 流启动前零上游调用；流内监听 { once: true }。
 *  3. 锁全路径释放恰一次（409 不释放 / 404 / 500 / 流 finally），照 91-a 骨架。
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
    return async (request: NextRequest) => {
      if (!mockState.user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      return handler({ request, user: mockState.user, supabase: mockState.supabase });
    };
  },
}));

vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 9 })),
  acquireLock: vi.fn(async () => true),
  releaseLock: vi.fn(async () => {}),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/sse', () => ({
  SSE_HEADERS: { 'Content-Type': 'text/event-stream' },
  sendSSEData: vi.fn(),
  closeSSE: vi.fn(),
}));

vi.mock('@/features/butterfly/lib/story-engine', () => ({
  isStoryEngineReady: vi.fn(() => true),
  regenerateOutline: vi.fn(async () => outlineFixture()),
  streamChapterStory: vi.fn(async () => sseUpstreamStream()),
  generateChoiceOptions: vi.fn(async () => ({ prompt: 'next?', options: [] })),
}));

vi.mock('@/features/butterfly/lib/illustration-engine', () => ({
  generateIllustration: vi.fn(async () => null),
}));

vi.mock('@/features/butterfly/lib/db-mappers', () => ({
  dbToSession: vi.fn((row: unknown) => row),
}));

import { POST } from '../route';
import { acquireLock, releaseLock } from '@/lib/distributed-lock';
import {
  isStoryEngineReady,
  regenerateOutline,
  streamChapterStory,
  generateChoiceOptions,
} from '@/features/butterfly/lib/story-engine';
import { generateIllustration } from '@/features/butterfly/lib/illustration-engine';
import { sendSSEData } from '@/lib/sse';
import type { ButterflySession, StoryOutline } from '@/features/butterfly/types';

const SESSION_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const LOCK_KEY = `preload:${SESSION_ID}`;

function outlineFixture(): StoryOutline {
  return {
    version: 2,
    decisionType: 'bought',
    decisionDescription: 'limited-time course upsell',
    chapters: [
      {
        index: 3,
        title: 'The Turn',
        summary: 'the course login email never arrives',
        hasChoice: false,
        tone: 'twist',
        timeSpan: 'two days later',
      },
    ],
    endingHint: 'the jacket outlives the hype',
  };
}

function sessionFixture(): ButterflySession {
  return {
    id: SESSION_ID,
    userId: 'user-123',
    decisionType: 'bought',
    decisionDescription: 'limited-time course upsell',
    amount: 199,
    platform: null,
    context: null,
    outline: {
      version: 1,
      decisionType: 'bought',
      decisionDescription: 'limited-time course upsell',
      chapters: [
        { index: 2, title: 'Crossroads', summary: 'a choice appears', hasChoice: true, tone: 'neutral', timeSpan: 'a day' },
      ],
      endingHint: 'h',
    },
    currentChapter: 2,
    chapters: [],
    choices: [],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    createdAt: '2026-09-19T00:00:00Z',
    updatedAt: '2026-09-19T00:00:00Z',
  };
}

/** butterfly_sessions 的 maybeSingle 返回预置行（dbToSession 被 mock 为恒等，行即 session）。 */
function authedMock(row: unknown) {
  const fakeSupabase = {
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (table === 'butterfly_sessions') {
            return { data: row, error: null };
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

function makeRequest(signal?: AbortSignal): NextRequest {
  return new NextRequest('http://localhost/api/butterfly/preload-branch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      chapterIndex: 3,
      selectedOption: 'A',
      isLight: false,
    }),
    signal,
  });
}

/** 上游 LLM 流：两个 chapter_text + 一个 chapter_end（SSE 格式），立即关闭。 */
function sseUpstreamStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"chapter_text","data":{"text":"hello"}}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"chapter_text","data":{"text":" world"}}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"chapter_end","data":{"fullText":"hello world"}}\n\n'));
      controller.close();
    },
  });
}

describe('POST /api/butterfly/preload-branch — lock & abort contract (batch92-b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStoryEngineReady).mockReturnValue(true);
    mockState.user = { id: 'user-123' };
    mockState.supabase = null;
  });

  it('acquires lock with key preload:<sessionId>, TTL 90s fail-closed; registers abort listener once; releases once after stream', async () => {
    authedMock(sessionFixture());
    const req = makeRequest();
    const addSpy = vi.spyOn(req.signal, 'addEventListener');
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(acquireLock).toHaveBeenCalledWith(LOCK_KEY, 90_000, true);
    expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    await vi.waitFor(() => expect(releaseLock).toHaveBeenCalledTimes(1));
    await res.body?.cancel();
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
    // 业务语义未变：上游恰好各跑一次，章节文本正常转发
    expect(regenerateOutline).toHaveBeenCalledTimes(1);
    expect(streamChapterStory).toHaveBeenCalledTimes(1);
    const chapterEnd = vi
      .mocked(sendSSEData)
      .mock.calls.map(([, event]) => event as { type: string; data?: { fullText?: string } })
      .find((event) => event.type === 'chapter_end');
    expect(chapterEnd?.data?.fullText).toBe('hello world');
  });

  it('concurrent duplicate request for same session: second gets 409 and runs zero upstream', async () => {
    authedMock(sessionFixture());
    vi.mocked(acquireLock).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const [r1, r2] = await Promise.all([POST(makeRequest()), POST(makeRequest())]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(409);
    expect(await r2.json()).toEqual({
      error: 'Branch preview already in progress for this session. Please wait.',
    });
    // 只有第一发跑了 LLM；锁只被第一发的流释放，第二发不释放（未持有）
    expect(regenerateOutline).toHaveBeenCalledTimes(1);
    expect(streamChapterStory).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(releaseLock).toHaveBeenCalledTimes(1));
    await r1.body?.cancel();
  });

  it('does not release when the lock was never acquired (409 contention path)', async () => {
    authedMock(sessionFixture());
    vi.mocked(acquireLock).mockResolvedValueOnce(false);
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Branch preview already in progress for this session. Please wait.',
    });
    expect(regenerateOutline).not.toHaveBeenCalled();
    expect(releaseLock).not.toHaveBeenCalled();
  });

  it('request aborted before upstream start: 499, lock released once, zero upstream calls', async () => {
    authedMock(sessionFixture());
    const controller = new AbortController();
    controller.abort();
    const req = makeRequest(controller.signal);
    const res = await POST(req);
    expect(res.status).toBe(499);
    expect(await res.json()).toEqual({ error: 'Client closed request before branch preview started' });
    expect(regenerateOutline).not.toHaveBeenCalled();
    expect(streamChapterStory).not.toHaveBeenCalled();
    expect(generateChoiceOptions).not.toHaveBeenCalled();
    expect(generateIllustration).not.toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('abort during outline regeneration: stream starts but skips upstream story call, lock released once', async () => {
    authedMock(sessionFixture());
    const controller = new AbortController();
    vi.mocked(regenerateOutline).mockImplementationOnce(async () => {
      controller.abort();
      return outlineFixture();
    });
    const req = makeRequest(controller.signal);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(streamChapterStory).not.toHaveBeenCalled();
    expect(generateChoiceOptions).not.toHaveBeenCalled();
    // 断开前不向已死的连接发任何事件
    expect(sendSSEData).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(releaseLock).toHaveBeenCalledTimes(1));
    await res.body?.cancel();
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('releases lock once when outline has no next chapter (404 path)', async () => {
    authedMock(sessionFixture());
    vi.mocked(regenerateOutline).mockImplementationOnce(async () => ({
      ...outlineFixture(),
      chapters: [],
    }));
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'No next chapter' });
    expect(streamChapterStory).not.toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });

  it('releases lock once when outline regeneration throws (500 path)', async () => {
    authedMock(sessionFixture());
    vi.mocked(regenerateOutline).mockRejectedValueOnce(new Error('LLM down'));
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Preview generation failed' });
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledWith(LOCK_KEY);
  });
});
