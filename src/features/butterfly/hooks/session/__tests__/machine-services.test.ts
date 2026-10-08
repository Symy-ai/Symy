import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, toPromise } from 'xstate';
import type { ButterflyMachineEvent } from '../butterfly-machine';
import type { ButterflyEndpoints } from '../butterfly-machine-types';
import { generateOutlineService, loadActiveService, streamStoryService } from '../machine-services';
import type { ButterflySession, StoryChapter } from '../../../types';
import { logger } from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const endpoints: ButterflyEndpoints = {
  session: '/api/butterfly/session',
  story: '/api/butterfly/story',
  choice: '/api/butterfly/choice',
  illustration: '/api/butterfly/illustration',
  preloadBranch: '/api/butterfly/preload-branch',
};

function chapter(index = 1): StoryChapter {
  return {
    index,
    title: `Chapter ${index}`,
    content: 'Content',
    tone: 'neutral',
    timeSpan: 'now',
    hasChoice: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function session(overrides: Partial<ButterflySession> = {}): ButterflySession {
  return {
    id: 'session-1',
    userId: 'user-1',
    decisionType: 'bought',
    decisionDescription: 'Coffee',
    amount: 10,
    platform: null,
    context: null,
    outline: null,
    currentChapter: 1,
    chapters: [chapter()],
    choices: [],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(events: object[]): Response {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n`)
    .join('');
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
}

function invokeService<T>(logic: unknown, input: unknown): Promise<T> {
  const actor = createActor(logic as never, { input: input as never });
  actor.start();
  return toPromise(actor as never) as Promise<T>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('loadActiveService', () => {
  it('returns null without fetch in demo mode or for signed-out users', async () => {
    await expect(invokeService<ButterflySession | null>(loadActiveService, {
      userId: 'user-1', isDemo: true, endpoints,
    })).resolves.toBeNull();
    await expect(invokeService<ButterflySession | null>(loadActiveService, {
      userId: null, isDemo: false, endpoints,
    })).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps 404 to null and 401/403/5xx to distinct failure paths', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ session: null }, 404))
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'broken' }, 500));

    await expect(invokeService<ButterflySession | null>(loadActiveService, {
      userId: 'user-1', isDemo: false, endpoints,
    })).resolves.toBeNull();
    await expect(invokeService<ButterflySession | null>(loadActiveService, {
      userId: 'user-1', isDemo: false, endpoints,
    })).rejects.toMatchObject({ name: 'AuthExpiredError' });
    await expect(invokeService<ButterflySession | null>(loadActiveService, {
      userId: 'user-1', isDemo: false, endpoints,
    })).rejects.toThrow('loadActiveService: HTTP 500');
    expect(fetch).toHaveBeenNthCalledWith(1, endpoints.session, { signal: expect.any(AbortSignal) });
  });

  it('passes the actor signal and returns the active session payload', async () => {
    const active = session();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ session: active }));

    await expect(invokeService<ButterflySession | null>(loadActiveService, {
      userId: 'user-1', isDemo: false, endpoints,
    })).resolves.toEqual(active);
    expect(fetch).toHaveBeenCalledWith(endpoints.session, { signal: expect.any(AbortSignal) });
  });
});

describe('generateOutlineService', () => {
  const input = {
    params: { decisionType: 'bought', decisionDescription: 'Coffee' },
    userId: 'user-1',
    isDemo: false,
    endpoints,
  };

  it('rejects a signed-out non-demo request before fetch', async () => {
    await expect(invokeService<ButterflySession>(
      generateOutlineService,
      { ...input, userId: null },
    )).rejects.toThrow('User is null but not demo mode');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the generation payload with abort signal and returns the created session', async () => {
    const created = session();
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ session: created }));

    await expect(invokeService<ButterflySession>(
      generateOutlineService,
      input,
    )).resolves.toEqual(created);
    expect(fetch).toHaveBeenCalledWith(endpoints.session, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.params),
      signal: expect.any(AbortSignal),
    });
  });

  it('prefers the server error message and maps auth failures to AuthExpiredError', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'Quota exceeded' }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 403));

    await expect(invokeService<ButterflySession>(
      generateOutlineService,
      input,
    )).rejects.toThrow('Quota exceeded');
    await expect(invokeService<ButterflySession>(
      generateOutlineService,
      input,
    )).rejects.toMatchObject({ name: 'AuthExpiredError' });
  });
});

describe('streamStoryService', () => {
type StreamInput = {
  session: ReturnType<typeof session> | null;
  isDemo: boolean;
  isLight: boolean;
  locale?: string;
  endpoints: ButterflyEndpoints;
};

  function stream(input: StreamInput, response: Response) {
    vi.mocked(fetch).mockResolvedValueOnce(response);
    const events: ButterflyMachineEvent[] = [];
    // 静态 context: createActor 的 input 事件 (xstate.init.actor) 不携带 input 字段,
    // ({event}) => event.input 形态在顶层 actor 场景解析为 undefined → service 早退
    const machine = setup({
      actors: { streamStoryService },
    }).createMachine({
      id: 'event-collector',
      initial: 'streaming',
      context: input as never,
      on: {
        '*': {
          actions: ({ event }) => {
            events.push(event as ButterflyMachineEvent);
          },
        },
      },
      states: {
        streaming: {
          invoke: {
            src: 'streamStoryService',
            input: ({ context }) => context as never,
          },
        },
      },
    });
    const actor = createActor(machine);
    actor.start();
    return { actor, events };
  }

  it('reports a stream error when no session exists', async () => {
    const { events } = stream({
      session: null, isDemo: false, isLight: false, endpoints,
    }, sseResponse([]));

    await vi.waitFor(() => expect(events).toEqual([
      { type: 'STREAM_ERROR', data: { message: 'No session' } },
    ]));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts the story request and emits machine events from SSE frames', async () => {
    const { events } = stream({
      session: session({ currentChapter: 1 }),
      isDemo: false,
      isLight: true,
      locale: 'zh-CN',
      endpoints,
    }, sseResponse([
      { type: 'chapter_start', data: { chapterIndex: 1, title: 'Chapter', tone: 'neutral', timeSpan: 'now' } },
      { type: 'chapter_text', data: { chapterIndex: 1, text: 'Once' } },
      { type: 'illustration_generated', data: { chapterIndex: 1, illustrationUrl: 'https://example.test/i.png' } },
      { type: 'chapter_end', data: { chapterIndex: 1, hasChoice: false } },
      { type: 'story_complete', data: { butterflyEffect: null, finalTone: 'neutral' } },
    ]));

    await vi.waitFor(() => expect(events).toEqual([
      { type: 'CHAPTER_START', data: { chapterIndex: 1, title: 'Chapter', tone: 'neutral', timeSpan: 'now' } },
      { type: 'CHAPTER_TEXT', data: { chapterIndex: 1, text: 'Once' } },
      // H3 fix 行为: illustration_generated 作为独立事件发出 (缓冲到 chapter_end 前flush)
      { type: 'ILLUSTRATION_GENERATED', data: { chapterIndex: 1, illustrationUrl: 'https://example.test/i.png' } },
      { type: 'CHAPTER_END', data: { chapterIndex: 1, hasChoice: false }, illustrationUrl: 'https://example.test/i.png' },
      { type: 'STORY_COMPLETE', data: { butterflyEffect: null, finalTone: 'neutral' } },
      { type: 'STREAM_DONE' },
    ]));
    expect(fetch).toHaveBeenCalledWith(endpoints.story, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', isLight: true, locale: 'zh-CN' }),
      signal: expect.any(AbortSignal),
    });
  });

  it('emits a stream error for a non-SSE response', async () => {
    const { events } = stream({
      session: session(), isDemo: false, isLight: false, endpoints,
    }, jsonResponse({ error: 'wrong transport' }));

    await vi.waitFor(() => expect(events).toEqual([
      { type: 'STREAM_ERROR', data: { message: 'Expected SSE response' } },
    ]));
  });

  it('aborts the in-flight stream from actor cleanup', async () => {
    let releaseReader: (() => void) | undefined;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {}\n'));
        releaseReader = () => controller.close();
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
    const { actor } = stream({
      session: session(), isDemo: false, isLight: false, endpoints,
    }, response);

    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal;
    actor.stop();
    expect(signal.aborted).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('[streamStoryService] cleanup called, aborting SSE');
    releaseReader?.();
  });
});
