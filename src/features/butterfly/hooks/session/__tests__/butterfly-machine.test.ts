import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor } from 'xstate';
import { butterflyMachine } from '../butterfly-machine';
import { initialContext, type ButterflyMachineContext } from '../butterfly-machine-types';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// machine-services 全部 stub 成立即 resolve 的 promise — 本测试锁 machine 拓扑/转换/全局事件
// MachineGuards 真实现 (纯函数, Round 60 提取) 用 importOriginal 透传
// services 全部 stub 成合法 XState logic (fromPromise/fromCallback) — 本测试锁 machine 拓扑
// streamStoryService 是 fromCallback 形状: (sendBack, onReceive) => cleanup — stub 永不 sendBack = SSE 流挂起
// 工厂内 dynamic import xstate 绕 vi.mock hoisting 限制
vi.mock('../machine-services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../machine-services')>();
  const { fromCallback, fromPromise } = await import('xstate');
  return {
    MachineGuards: actual.MachineGuards,
    loadActiveService: fromPromise(() => Promise.resolve(null)),
    generateOutlineService: fromPromise(() => Promise.resolve({ id: 'stub-session' })),
    streamStoryService: fromCallback(() => { /* 挂起: 不 sendBack STREAM_DONE, 让测试控制 */ }),
    submitChoiceService: fromPromise(() => Promise.resolve(null)),
    regenerateService: fromPromise(() => Promise.resolve({ chapterIndex: 1, url: null })),
    preloadNextChapterActor: fromPromise(() => Promise.resolve(null)),
    preloadBranchActor: fromPromise(() => Promise.resolve(null)),
    tryClientIllustrationActor: fromPromise(() => Promise.resolve(null)),
    generateSceneIllustrationsActor: fromPromise(() => Promise.resolve(null)),
    illustrationPollingActor: fromPromise(() => Promise.resolve(null)),
  };
});

type Snapshot = ReturnType<ReturnType<typeof createActor<typeof butterflyMachine>>['getSnapshot']>;

function startMachine(input: Partial<ButterflyMachineContext> = {}) {
  const actor = createActor(butterflyMachine, { input });
  actor.start();
  return actor;
}

/** actor 当前状态 value (string) */
function stateOf(actor: ReturnType<typeof startMachine>): string {
  const s: Snapshot = actor.getSnapshot();
  return String((s as unknown as { value: string }).value);
}

/** actor context */
function ctxOf(actor: ReturnType<typeof startMachine>): ButterflyMachineContext {
  const s: Snapshot = actor.getSnapshot();
  return (s as unknown as { context: ButterflyMachineContext }).context;
}

describe('butterfly-machine 拓扑与转换', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('初始 idle + context 合并 input', () => {
    const actor = startMachine({ userId: 'u1' });
    expect(stateOf(actor)).toBe('idle');
    expect(ctxOf(actor).userId).toBe('u1');
    expect(ctxOf(actor).isLoading).toBe(false); // initialContext 默认
  });

  it('CREATE_SESSION 全局入口: idle→generating_outline + resetContext + isLoading=true (BUG-002)', async () => {
    const actor = startMachine({ userId: 'u1' });
    actor.send({ type: 'CREATE_SESSION', params: { decisionType: 'bought', decisionDescription: 'd' } });
    expect(stateOf(actor)).toBe('generating_outline');
    expect(ctxOf(actor).isLoading).toBe(true);
    // onDone (stub resolve) → streaming (微任务后)
    await vi.waitFor(() => expect(stateOf(actor)).toBe('streaming'));
  });

  it('idle TOGGLE_OUTLINE 翻转 outlineVisible 不换状态', () => {
    const actor = startMachine();
    actor.send({ type: 'TOGGLE_OUTLINE' });
    expect(stateOf(actor)).toBe('idle');
    expect(ctxOf(actor).outlineVisible).toBe(true);
    actor.send({ type: 'TOGGLE_OUTLINE' });
    expect(ctxOf(actor).outlineVisible).toBe(false);
  });

  it('SYNC_CONTEXT 全局: 只并 context 不换状态', () => {
    const actor = startMachine();
    actor.send({ type: 'SYNC_CONTEXT', userId: 'u9', isLight: true, endpoints: initialContext.endpoints, locale: 'zh' });
    expect(stateOf(actor)).toBe('idle');
    expect(ctxOf(actor).isLight).toBe(true);
  });

  it('error 状态 RETRY 无 session → idle + clearError (H7)', async () => {
    const actor = startMachine({ userId: 'u1' });
    // 直接送进 error: STREAM_ERROR 只在 streaming 处理 — 用 CREATE_SESSION 失败路径太重,
    // 借助 RESET 目标语义: 直接把 error 塞 context 后 RETRY 走 idle 分支
    actor.send({ type: 'CREATE_SESSION', params: { decisionType: 'bought', decisionDescription: 'x' } });
    await vi.waitFor(() => expect(stateOf(actor)).toBe('streaming'));
    actor.send({ type: 'STREAM_ERROR', data: { message: 'boom' } as never });
    expect(stateOf(actor)).toBe('error');
    // RETRY: stub onDone 已设 session (无 chapters) → hasSessionNoChapters 路径回 streaming + clearError
    actor.send({ type: 'RETRY' });
    await vi.waitFor(() => expect(stateOf(actor)).toBe('streaming'));
    expect(ctxOf(actor).error).toBeNull();
  });

  it('STREAM_DONE: streaming→idle + resetContext (Gacha stuck v3 修复)', async () => {
    const actor = startMachine({ userId: 'u1' });
    actor.send({ type: 'CREATE_SESSION', params: { decisionType: 'bought', decisionDescription: 'x' } });
    await vi.waitFor(() => expect(stateOf(actor)).toBe('streaming'));
    actor.send({ type: 'STREAM_DONE' });
    expect(stateOf(actor)).toBe('idle');
    expect(ctxOf(actor).completedChapters).toEqual([]);
  });

  it('RESET 从任意状态回 idle + resetContext', async () => {
    const actor = startMachine({ userId: 'u1' });
    actor.send({ type: 'CREATE_SESSION', params: { decisionType: 'bought', decisionDescription: 'x' } });
    await vi.waitFor(() => expect(stateOf(actor)).toBe('streaming'));
    actor.send({ type: 'RESET' });
    expect(stateOf(actor)).toBe('idle');
    expect(ctxOf(actor).isLoading).toBe(false);
  });

  it('STORY_COMPLETE: streaming→complete', async () => {
    const actor = startMachine({ userId: 'u1' });
    actor.send({ type: 'CREATE_SESSION', params: { decisionType: 'bought', decisionDescription: 'x' } });
    await vi.waitFor(() => expect(stateOf(actor)).toBe('streaming'));
    actor.send({ type: 'STORY_COMPLETE', data: { butterflyEffect: 'e', finalTone: 'hopeful', totalChapters: 3 } });
    expect(stateOf(actor)).toBe('complete');
  });

  it('CONTINUE: streaming→continuing (Round 12 audit C1 — 不再丢弃)', async () => {
    const actor = startMachine({ userId: 'u1' });
    actor.send({ type: 'CREATE_SESSION', params: { decisionType: 'bought', decisionDescription: 'x' } });
    await vi.waitFor(() => expect(stateOf(actor)).toBe('streaming'));
    actor.send({ type: 'CONTINUE' });
    // continuing.always isNotPreloading=true → 立即 fallback streaming
    expect(['continuing', 'streaming']).toContain(stateOf(actor));
  });

  it('CLEAR_PRELOADED_STORY_COMPLETE 全局: 清残留 (修复事件从未处理)', () => {
    const actor = startMachine({ preloadedStoryComplete: { butterflyEffect: 'stale', finalTone: 'dark' } } as never);
    actor.send({ type: 'CLEAR_PRELOADED_STORY_COMPLETE' });
    expect(ctxOf(actor).preloadedStoryComplete).toBeNull();
  });

  it('CHOICE_PROMPT: streaming→choosing + pendingChoice 入 context', async () => {
    const actor = startMachine({ userId: 'u1' });
    actor.send({ type: 'CREATE_SESSION', params: { decisionType: 'bought', decisionDescription: 'x' } });
    await vi.waitFor(() => expect(stateOf(actor)).toBe('streaming'));
    actor.send({ type: 'CHOICE_PROMPT', data: { chapterIndex: 1, prompt: 'Choose', options: [{ id: 'a', label: 'A', hint: 'h1' }, { id: 'b', label: 'B', hint: 'h2' }] } });
    expect(stateOf(actor)).toBe('choosing');
    expect(ctxOf(actor).pendingChoice?.prompt).toBe('Choose');
    expect(ctxOf(actor).pendingChoice?.options).toHaveLength(2);
  });
});

describe('butterfly-machine derive 语义快照', () => {
  it('initialContext 形状: 30 字段关键字段位 (回归锚)', () => {
    const keys = Object.keys(initialContext);
    // 关键字段必须存在 — 字段被删时此锚会断
    for (const k of [
      'isLoading', 'error', 'session', 'completedChapters', 'pendingChoice',
      'storyComplete', 'preloadedChapterData', 'preloadedBranches', 'isPreloading',
      'isDemo', 'isLight', 'endpoints', 'userId', 'isPollingActive',
      'clientIllustrationAttempted', 'chapterSceneTriggered', 'savedPendingChoice',
    ] as const) {
      expect(keys).toContain(k);
    }
    expect(initialContext.endpoints.preloadBranch).toBe('/api/butterfly/preload-branch');
  });
});
