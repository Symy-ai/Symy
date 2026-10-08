import { describe, expect, it, vi } from 'vitest';

vi.mock('../preload-logic', async () => {
  // 真纯函数? 先透传 — 只测 actors 编排层
  const actual = await vi.importActual<typeof import('../preload-logic')>('../preload-logic');
  return actual;
});

import { preloadBranchActor, preloadNextChapterActor } from '../preload-actors';

/**
 * preload-actors.ts (224行) — XState preload spawn actors (Round 64 拆分件)。
 *
 * fromCallback + sendBack 模式: 直接调用 actor 收到的是 (callback input sendBack) 之外 —
 * 实际签名 ({ input, sendBack })。测试法: actor 是 fromCallback 返回的对象, 但可以直接
 * 取其 .callback? 不可 — 惯例: 通过 interpret 或直接调 actor 内部。
 * XState v5 fromCallback 返回 { callback } 形 actor — 调 actor.start? 
 * 更稳: interpret(actor).start() 太重。这里直接用 actor 的 transition?
 * 简化: fromCallback 工厂接受 ({input, sendBack}) — 我们 mock xstate.fromCallback
 * 捕获工厂函数直接调用。
 */

// XState v5 fromCallback actor 形状 (探针实证): { config, start, transition, ... }
// config = arity-1 工厂: ({input, sendBack}) => cleanup
type SendBack = (event: unknown) => void;
type CallbackActor = { config: (ctx: { input: unknown; sendBack: SendBack }) => () => void };

function invokeFactory(actor: CallbackActor, input: unknown, sendBack: SendBack): () => void {
  return actor.config({ input, sendBack });
}

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(e + '\n'));
      c.close();
    },
  });
}

const baseSession = {
  id: 'sess-1', status: 'active', decisionType: 'bought',
  decisionDescription: '买了机械键盘', currentChapter: 1, choices: [],
};

function makeNextInput(overrides: Record<string, unknown> = {}) {
  return {
    session: baseSession,
    endpoints: { story: '/api/butterfly/story', preloadBranch: '/api/b/preload' },
    isDemo: false, isLight: true,
    ...overrides,
  };
}

const fetchOk = (body: ReadableStream<Uint8Array> | null) =>
  vi.fn(() => Promise.resolve({ ok: true, body } as never)) as unknown as typeof fetch;
const fetchErr = (status: number) =>
  vi.fn(() => Promise.resolve({ ok: false, status } as never)) as unknown as typeof fetch;

const ev = (type: string, data: Record<string, unknown>) =>
  `data: ${JSON.stringify({ type, data })}`;

describe('preloadNextChapterActor (fromCallback 编排层)', () => {
  it('session 缺失/completed → 立即 PRELOAD_CHAPTER_DONE null', async () => {
    const events: unknown[] = [];
    for (const sess of [undefined, { ...baseSession, status: 'completed' }]) {
      globalThis.fetch = vi.fn();
      const cleanup = invokeFactory(
        preloadNextChapterActor as never,
        makeNextInput({ session: sess }),
        (e) => events.push(e),
      );
      await new Promise((r) => setTimeout(r, 550)); // 500ms timer
      expect(events[events.length - 1]).toEqual({ type: 'PRELOAD_CHAPTER_DONE', data: null });
      events.length = 0;
      cleanup();
    }
  });

  it('正常 SSE 流 → PRELOAD_CHAPTER_DONE 携带 chapter+outline', async () => {
    const events: unknown[] = [];
    globalThis.fetch = fetchOk(sseStream([
      ev('chapter_start', { chapterIndex: 2 }),
      ev('chapter_text', { text: '第二章正文' }),
      ev('chapter_end', { chapterIndex: 2 }),
    ]));
    const cleanup = invokeFactory(
      preloadNextChapterActor as never,
      makeNextInput(),
      (e) => events.push(e),
    );
    await new Promise((r) => setTimeout(r, 700));
    cleanup();
    const done = events.find((e) => (e as { type: string }).type === 'PRELOAD_CHAPTER_DONE') as { data: { chapter: { index: number; content: string } | null } } | undefined;
    expect(done?.data?.chapter?.index).toBe(2);
    expect(done?.data?.chapter?.content).toBe('第二章正文');
  });

  it('HTTP 非 ok → PRELOAD_CHAPTER_DONE null', async () => {
    const events: unknown[] = [];
    globalThis.fetch = fetchErr(500);
    const cleanup = invokeFactory(
      preloadNextChapterActor as never,
      makeNextInput(),
      (e) => events.push(e),
    );
    await new Promise((r) => setTimeout(r, 700));
    cleanup();
    expect(events[events.length - 1]).toEqual({ type: 'PRELOAD_CHAPTER_DONE', data: null });
  });

  it('story_complete 事件 → PRELOAD_STORY_COMPLETE_DONE (finalTone/totalChapters/butterflyEffect) + 随即 DONE', async () => {
    const events: unknown[] = [];
    globalThis.fetch = fetchOk(sseStream([
      ev('chapter_start', { chapterIndex: 3 }),
      ev('chapter_text', { text: '最终章' }),
      ev('story_complete', { finalTone: 'green', totalChapters: 3, butterflyEffect: '省下了 80 元' }),
    ]));
    invokeFactory(preloadNextChapterActor as never, makeNextInput(), (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 700));
    const complete = events.find((e) => (e as { type: string }).type === 'PRELOAD_STORY_COMPLETE_DONE') as { data: Record<string, unknown> } | undefined;
    expect(complete?.data).toMatchObject({ finalTone: 'green', totalChapters: 3 });
    expect(events[events.length - 1]).toEqual({ type: 'PRELOAD_CHAPTER_DONE', data: null });
  });

  it('choiceData 存在 → 额外发 CHOICE_PROMPT', async () => {
    const events: unknown[] = [];
    globalThis.fetch = fetchOk(sseStream([
      ev('chapter_start', { chapterIndex: 2 }),
      ev('chapter_text', { text: '章节文本' }),
      ev('choice_prompt', { chapterIndex: 2, prompt: '接下来？', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] }),
    ]));
    invokeFactory(preloadNextChapterActor as never, makeNextInput(), (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 700));
    const choice = events.find((e) => (e as { type: string }).type === 'CHOICE_PROMPT') as { data: { prompt: string; options: { id: string }[] } } | undefined;
    expect(choice?.data?.prompt).toBe('接下来？');
    expect(choice?.data?.options).toHaveLength(2);
  });

  it('空流 (无 chapter 数据) → PRELOAD_CHAPTER_DONE null', async () => {
    const events: unknown[] = [];
    globalThis.fetch = fetchOk(sseStream([]));
    invokeFactory(preloadNextChapterActor as never, makeNextInput(), (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 700));
    expect(events[events.length - 1]).toEqual({ type: 'PRELOAD_CHAPTER_DONE', data: null });
  });

  it('demo 分支 body 携带决策三件套 (decisionType/Description/choices)', async () => {
    const fetchMock = vi.fn((_url: unknown, _init?: RequestInit) => Promise.resolve({ ok: false, status: 501 } as never));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    invokeFactory(preloadNextChapterActor as never, makeNextInput({ isDemo: true }), () => {});
    await new Promise((r) => setTimeout(r, 700));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.decisionType).toBe('bought');
    expect(body.decisionDescription).toBe('买了机械键盘');
    expect(body.currentChapter).toBe(1);
  });

  it('清理函数: abort 取消后不再发事件 (AbortError 静默)', async () => {
    const events: unknown[] = [];
    globalThis.fetch = fetchOk(new ReadableStream<Uint8Array>({
      start() { /* 永不 enqueue — 挂起 */ },
    }));
    const cleanup = invokeFactory(preloadNextChapterActor as never, makeNextInput(), (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 550));
    cleanup(); // 触发 abort
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toEqual([]); // 无任何事件泄漏
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe('preloadBranchActor', () => {
  it('session 缺失/isDemo → PRELOAD_BRANCH_DONE null (无 fetch)', async () => {
    const events: unknown[] = [];
    globalThis.fetch = vi.fn();
    invokeFactory(preloadBranchActor as never, {
      session: undefined, endpoints: {}, isDemo: false, isLight: true, optionId: 'a',
    }, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 20));
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(events[events.length - 1]).toEqual({ type: 'PRELOAD_BRANCH_DONE', optionId: 'a', data: null });
  });

  it('正常流 → PRELOAD_BRANCH_DONE 携带 chapter+outline+choice (optionId 回带)', async () => {
    const events: unknown[] = [];
    globalThis.fetch = fetchOk(sseStream([
      ev('chapter_start', { chapterIndex: 3 }),
      ev('chapter_text', { text: '分支正文' }),
    ]));
    invokeFactory(preloadBranchActor as never, {
      session: baseSession, endpoints: {}, isDemo: false, isLight: true, optionId: 'opt-9',
    }, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 100));
    const done = events.find((e) => (e as { type: string }).type === 'PRELOAD_BRANCH_DONE') as { optionId: string; data: { chapter: { index: number; content: string } | null } } | undefined;
    expect(done?.optionId).toBe('opt-9');
    expect(done?.data?.chapter?.index).toBe(3);
    process.stdout.write('DBG3:' + JSON.stringify(events) + '\n');
  });

  it('POST body: sessionId+chapterIndex+selectedOption+isLight', async () => {
    const fetchMock = vi.fn((_url: unknown, _init?: RequestInit) => Promise.resolve({ ok: false, status: 500 } as never));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    invokeFactory(preloadBranchActor as never, {
      session: baseSession, endpoints: {}, isDemo: false, isLight: true, optionId: 'x',
    }, () => {});
    await new Promise((r) => setTimeout(r, 50));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ sessionId: 'sess-1', chapterIndex: 1, selectedOption: 'x', isLight: true });
  });

  it('HTTP 错误 → BRANCH_DONE null', async () => {
    const events: unknown[] = [];
    globalThis.fetch = fetchErr(503);
    invokeFactory(preloadBranchActor as never, {
      session: baseSession, endpoints: {}, isDemo: false, isLight: true, optionId: 'y',
    }, (e) => events.push(e));
    await new Promise((r) => setTimeout(r, 50));
    expect(events[events.length - 1]).toEqual({ type: 'PRELOAD_BRANCH_DONE', optionId: 'y', data: null });
  });
});
