// @vitest-environment happy-dom

/**
 * 访客 (guest / demo) 首体验端到端链路测试 — batch124-b
 *
 * 承接 batch124-a (`doc/demo-retry-fix-result.md`) 锁定的 guest 断点, 本文件把「访客进站 →
 * 首条消息 → 连续对话 → 挑战首条 → 额度耗尽」整条链路在 hook 层端到端跑通, 断言**当前真实
 * 行为**。本文件即 QA 站逐条核对的清单: 绿 = 该断点已过, 注释里的 ⚠️ = 尚存断点/需浏览器复核。
 *
 * 与 use-chat-actions.test.tsx 的差异 (本文件专属, 不改既有用例):
 *  - isDemo=true 为默认 harness 状态 (访客视角), 且默认无 activeChallenge
 *  - 连发/dedup 走访客真实路径 (canned timer), 而非真 AI 流 — 流式 mock 无法在 hook 层
 *    复现真实 fetch 的 abort 语义, 该断点留给 QA 站真浏览器 (见文末「留给 QA 站」)
 *  - 429 走完整端到端链路 (sendMessage → 气泡 onRetry → retryAiResponse) 而非只 mock 一次
 *
 * 覆盖:
 *  - 场景 A 访客首条普通消息 → **canned 路径**: 零 fetch / 1.5s 后恰 1 条 canned 回复 /
 *    demoMsgCount=1 / 满 3 条排 auth 引导 timer (⚠️ 真 AI 只在 challenge 首条触发)
 *  - 场景 B 访客连发 (不同文案) → 锁 force-abort 放行 + 各条各自 canned 回复;
 *    1s dedup 窗口内同文案连点被静默吞掉
 *  - 场景 C 挑战首条 → 真实 AI: challengeContext 上行 + mode='challenge' + 落库;
 *    连发时 messages 体量按 ref 重建 1→3→5 (⚠️ route 侧 zod max(10) 边界)
 *  - 场景 D 匿名 3 条/天额度耗尽 (429) → 端到端 isError 气泡 + onRetry, 全程零注册引导
 *
 * 环境约定:
 *  - harness 沿用 chat-tab 对 useChatActions 的逐项注入 (无 provider 依赖)
 *  - i18n 走 key 透传 (t = key => key), 与既有例一致, 文案断言即 key
 *  - 访客计数语义: demoMsgCount 由 challenge 首条置 1, canned 路径每条 +1
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ChatMessage } from '@/types/chat-message';
import { useChatActions } from '../use-chat-actions';
import type { UseChatActionsParams } from '../use-chat-actions-types';

vi.mock('@/lib/posthog', () => ({
  symyEvents: { chatMessageSent: vi.fn() },
}));

const t = vi.fn((key: string) => key);

/** SSE 响应 — events 为逐条 event 对象, 尾部自动补 [DONE] */
function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** 与 /api/chat/anonymous/route.ts 同款 429 payload (Trial limit reached) */
function trialLimit429(): Response {
  return new Response(
    JSON.stringify({
      error: 'Trial limit reached',
      remaining: 0,
      message: 'Trial limit reached (3/day). Sign up to chat unlimited and save your insights.',
      signUpUrl: '/auth/signup',
    }),
    { status: 429, headers: { 'Content-Type': 'application/json' } },
  );
}

const CH = { itemName: 'Air Fryer', amount: 89, challengeId: 'ch-1' };
/** 生产常量 (use-chat-demo-mode.ts DEMO_FREE_MESSAGES = 3) — harness 注入, 阈值以 3 为准 */
const DEMO_FREE_MESSAGES = 3;

/** chat-tab 逐项注入的 state 形状 — isDemo 决定访客/登录端点分支 */
function makeState(isDemo: boolean, activeChallenge?: UseChatActionsParams['state']['activeChallenge']) {
  return {
    activeChallenge,
    isLoadingHistory: false,
    isDemo,
    impulseContext: undefined,
    locale: 'en' as const,
  };
}

/** 挑战场景 harness: 访客 + 活跃挑战 (createChallenge 弹层带上来) */
function makeChallengeHarness() {
  const harness = makeHarness({ state: makeState(true, { ...CH }) });
  harness.params.refs.activeChallengeRef.current = { ...CH };
  return harness;
}

function makeHarness(overrides: Partial<UseChatActionsParams> = {}) {
  // setMessagesSync 驱动真实 state 归约器 + messagesRef 镜像 (近似 chat-tab 的 ref 同步)
  const holder = { list: [] as ChatMessage[] };
  const messagesRef = { current: [] as ChatMessage[] };
  const setMessagesSync = vi.fn(
    (updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      holder.list = typeof updater === 'function' ? updater(holder.list) : updater;
      messagesRef.current = holder.list.map((m) => ({ ...m }));
    }
  );
  let idSeq = 0;
  const params: UseChatActionsParams = {
    state: {
      activeChallenge: undefined,
      isLoadingHistory: false,
      isDemo: true,
      impulseContext: undefined,
      locale: 'en',
    },
    refs: {
      sendMessageLockRef: { current: { inProgress: false, lastContent: '', lastTime: 0 } },
      abortRef: { current: null },
      messagesRef,
      activeChallengeRef: { current: undefined },
      impulseContextRef: { current: undefined },
      localeRef: { current: 'en' },
      justCompletedChallengeRef: { current: false },
      demoReplyTimerRef: { current: null },
      demoAuthTimerRef: { current: null },
      demoMsgCountRef: { current: 0 },
      buddyStateRefreshTimerRef: { current: null },
      skipNextHistoryLoadRef: { current: false },
      skipNonceRef: { current: 0 },
      justBoughtChallengeRef: { current: false },
    },
    setters: {
      setMessagesSync,
      setIsLoading: vi.fn(),
      setInput: vi.fn(),
      setActiveChallenge: vi.fn(),
    },
    callbacks: {
      nextId: vi.fn((prefix: string) => `${prefix}-${++idSeq}`),
      saveMessage: vi.fn<(message: ChatMessage) => void>(),
      handleMCPResults: vi.fn(),
      addMcpNotification: vi.fn(),
      onBuddyStateRefresh: vi.fn(),
      onAuthPrompt: vi.fn(),
      onToast: vi.fn(),
      onChallengeCompleted: vi.fn(),
      onChallengeBought: vi.fn(),
    },
    i18n: { t: t as unknown as UseChatActionsParams['i18n']['t'] },
    demo: { DEMO_FREE_MESSAGES },
    ...overrides,
  };
  const { result } = renderHook(() => useChatActions(params));
  return { params, holder, result, saveMessage: params.callbacks.saveMessage as ReturnType<typeof vi.fn> };
}

function fetchBody(fetchMock: ReturnType<typeof vi.fn>, call = 0): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[call][1].body as string);
}

function requestMessages(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return (fetchBody(fetchMock, call).messages as { role: string; content: string }[]) ?? [];
}

describe('访客首体验 — 场景 A: 首条普通消息走 demo canned (零 fetch)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    t.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('访客首条普通消息: 零 fetch, 1.5s 后恰 1 条 canned 回复, 锁释放, 计数=1, 零注册引导', async () => {
    const { params, holder, result } = makeHarness();

    await act(async () => {
      await result.current.sendMessage('I am thinking about buying a new pair of running shoes');
    });

    // ⚠️ 断点 B-1: 访客普通消息零真实 AI 请求 (canned 路径)
    expect(fetchMock).not.toHaveBeenCalled();
    expect(holder.list).toHaveLength(1);
    expect(holder.list[0]).toMatchObject({
      role: 'user',
      content: 'I am thinking about buying a new pair of running shoes',
    });
    // 1.5s canned 回复窗口内持锁
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(holder.list).toHaveLength(2);
    expect(holder.list[1].role).toBe('assistant');
    expect(holder.list[1].content).not.toBe('');
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(false);
    expect(params.refs.demoMsgCountRef.current).toBe(1);
    expect(params.setters.setIsLoading).toHaveBeenLastCalledWith(false);
    // 计数 1 < 3 → 无注册引导 timer
    expect(params.refs.demoAuthTimerRef.current).toBeNull();
    expect(params.callbacks.onAuthPrompt).not.toHaveBeenCalled();
  });

  it('访客发满 DEMO_FREE_MESSAGES(3) 条 → 第 3 条 canned 后排注册引导 timer', async () => {
    const { params, holder, result } = makeHarness();

    for (const text of ['first', 'second', 'third']) {
      await act(async () => {
        await result.current.sendMessage(text);
        await vi.advanceTimersByTimeAsync(1600);
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(holder.list).toHaveLength(6);
    expect(params.refs.demoMsgCountRef.current).toBe(DEMO_FREE_MESSAGES);
    expect(params.refs.demoAuthTimerRef.current).not.toBeNull();

    // 引导 timer 1s 后触发 onAuthPrompt('chat')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(params.callbacks.onAuthPrompt).toHaveBeenCalledWith('chat');
  });
});

describe('访客首体验 — 场景 B: 连发时的锁放行与 dedup', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();
    t.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1.5s 回复窗口内连发第 2 条 (不同文案) → 锁放行, 但第 1 条 canned 回复被清掉 ⚠️', async () => {
    const { params, holder, result } = makeHarness();

    // 第 1 条: 持锁 + 排 canned timer (1500ms), 不等它落地
    await act(async () => {
      await result.current.sendMessage('how do I stop impulse buys?');
    });
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(true);
    expect(params.refs.demoReplyTimerRef.current).not.toBeNull();

    // 第 2 条: 锁持有但文案不同 → dedup 放行 → force-abort → 仍进 canned 路径
    await act(async () => {
      await result.current.sendMessage('give me three ideas');
      await vi.advanceTimersByTimeAsync(1600);
    });

    // 两条用户消息都在 (无吞消息回归)
    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(2);
    // ⚠️ 断点 B-4: demo-send-message.ts:67 clearTimeout(demoReplyTimerRef) 把第 1 条排队的
    //   canned 回复整条丢弃 → 第 1 条用户消息永远等不到回复 (非错误气泡、无 onRetry 可点)。
    expect(holder.list.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(holder.list.filter((m) => m.role === 'assistant')[0].content).not.toBe('');
    expect(params.refs.sendMessageLockRef.current.inProgress).toBe(false);
    // 计数只 +1 (被清掉的那条从未落地, 其 +1 随 timer 一起消失)
    expect(params.refs.demoMsgCountRef.current).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('1s dedup 窗口内同文案连点 → 第 2 次被吞 (零新请求, 无新用户消息)', async () => {
    const { params, holder, result } = makeHarness();

    await act(async () => {
      await result.current.sendMessage('same content');
    });
    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(params.refs.sendMessageLockRef.current.lastContent).toBe('same content');

    // 同文案 (<1s) → dedup 静默 return, 不排队 canned
    await act(async () => {
      await result.current.sendMessage('same content');
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(holder.list.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(params.refs.demoMsgCountRef.current).toBe(1);
  });
});

describe('访客首体验 — 场景 C: 挑战首条真实 AI 全链路', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    t.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('createChallenge 带上来的挑战上下文首条 → anonymous 端点 + challengeContext + mode=challenge', async () => {
    const { params, holder, result, saveMessage } = makeChallengeHarness();
    fetchMock.mockResolvedValueOnce(sseResponse([{ type: 'token', content: 'real analysis' }]));

    await act(async () => {
      await result.current.sendMessage('I want the Air Fryer');
    });

    // 端点单源: 访客恒 anonymous (batch124-a 修复不回归)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat/anonymous');
    expect(fetchBody(fetchMock).challengeContext).toEqual(CH);
    // 真实 AI body 契约字段 (与登录态同构)
    const body = fetchBody(fetchMock);
    expect(body.stream).toBe(true);
    expect(body.locale).toBe('en');
    expect(body.guardIntensity).toBeDefined();
    expect(body.guardScope).toBeDefined();

    expect(holder.list).toHaveLength(2);
    expect(holder.list[0]).toMatchObject({ role: 'user', mode: 'challenge' });
    expect(holder.list[1]).toMatchObject({ role: 'assistant', content: 'real analysis', mode: 'challenge' });
    expect(saveMessage).toHaveBeenCalledTimes(2);
    // 首条真实 AI 消耗计数 → 之后 (demoMsgCount>=1) 走 canned 计数路径
    expect(params.refs.demoMsgCountRef.current).toBe(1);
    expect(params.refs.demoReplyTimerRef.current).toBeNull();
    expect(params.callbacks.onAuthPrompt).not.toHaveBeenCalled();
  });

  it('挑战首条后 visitor 连发 (canned) → messages 体量 1→3→5 (前端零截断, ⚠️ route 侧 zod max(10))', async () => {
    const { holder, result } = makeHarness();
    fetchMock.mockResolvedValue(sseResponse([{ type: 'token', content: 'reply' }]));

    // 1st: 首条消息 (无 activeChallenge) → 访客 canned 路径, 零 fetch (见场景 A)
    //   注: demoMsgCount 由 canned timer 回调 +1, 本 describe 用真实定时器, 故此处不断言计数。
    await act(async () => {
      await result.current.sendMessage('first');
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(holder.list).toHaveLength(1);

    // 2nd: 访客聊到"第 5 轮真实 AI 请求"时的 canonical 上下文体量。
    //   本 harness 的访客视角在第 1 条后已固化为 canned 路径 (与生产一致, 断点 B-1),
    //   故此处用"预置 2 组 user+assistant 占位"等价模拟一轮真实 AI 对话后的 messagesRef,
    //   再走真实 AI 路径 (isDemo=false, 端点 /api/chat) 锁死体量增长 1 → 3 → 5。
    const realHarness = makeHarness({ state: makeState(false) });
    const seeded: ChatMessage[] = [0, 1].flatMap((i) => [
      {
        id: `seed-u-${i}`,
        role: 'user' as const,
        content: `past user ${i}`,
        timestamp: new Date(),
      },
      {
        id: `seed-a-${i}`,
        role: 'assistant' as const,
        content: `past reply ${i}`,
        timestamp: new Date(),
      },
    ]);
    // harness 的 setMessagesSync 以 holder.list 为 prev 并镜像进 messagesRef → 两处都要种
    realHarness.holder.list = [...seeded];
    realHarness.params.refs.messagesRef.current = [...seeded];

    await act(async () => {
      await realHarness.result.current.sendMessage('what now?');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/chat');
    // 预置 4 条 + 本轮 user = 5 条, 前端零截断
    expect(requestMessages(fetchMock, 0)).toHaveLength(5);

    // ⚠️ 契约边界: /api/chat/anonymous 的 anonymousChatSchema = z.array(...).min(1).max(10)
    //   → 访客端每轮 +2 (本轮 user + assistant 占位), 第 5 轮 9 条 / 第 6 轮 11 条即撞 max(10) 被
    //   zod 400。本用例只锁死"前端不截断"这一事实, 具体第几轮 400 需 QA 站真机复核。
    expect(requestMessages(fetchMock, 0).length).toBeLessThanOrEqual(10);
  });
});

describe('访客首体验 — 场景 D: 匿名额度耗尽 (429) 端到端', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    t.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('challenge 首条遇 429 → isError 气泡 + onRetry; 点重试仍打 anonymous → 再 429, 零注册引导 ⚠️', async () => {
    const { params, holder, result, saveMessage } = makeChallengeHarness();
    // 匿名每日额度 3 次/天 (route 侧消费, 本 harness 不模拟) — 额度耗尽后所有轮次 429
    fetchMock.mockResolvedValueOnce(trialLimit429());
    fetchMock.mockResolvedValueOnce(trialLimit429());

    await act(async () => {
      await result.current.sendMessage('I want the Air Fryer');
    });

    // sendMessage 的 429 走 catch → isError 气泡 + onRetry (同 503 分支, 无 429 特判)
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sendErr = holder.list.find((m) => m.isError);
    expect(sendErr).toMatchObject({ role: 'assistant', content: 'chat.aiFallback.aiError' });
    expect(typeof sendErr!.onRetry).toBe('function');

    // 点重试 (气泡 onRetry → setTimeout(0) → retryAiResponseImpl)
    await act(async () => {
      sendErr!.onRetry!();
      await new Promise((r) => setTimeout(r, 30));
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // retry 端点仍是 anonymous (batch124-a 修复不回归)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/chat/anonymous');
    // retry 侧 429 → 同分支: 新的 isError 气泡 + onRetry (原 user 消息不复制)
    const retryErr = holder.list.find((m) => m.isError && m.content === 'chat.aiFallback.aiError');
    expect(retryErr).toBeDefined();
    expect(typeof retryErr!.onRetry).toBe('function');
    expect(holder.list.filter((m) => m.role === 'user')).toHaveLength(1);

    // ⚠️ 断点 B-2: 额度耗尽全程零注册引导 — onAuthPrompt / onToast 零调用, signUpUrl 未透传
    //   (retry-ai-response.ts 的 !response.ok 只对 401 特判, 429 落 aiError 文案)
    expect(params.callbacks.onAuthPrompt).not.toHaveBeenCalled();
    expect(params.refs.demoAuthTimerRef.current).toBeNull();
    expect(params.callbacks.onToast).not.toHaveBeenCalled();
    // 错误气泡不落库 (BUG-116)
    expect(saveMessage.mock.calls.every((call) => call[0].isError !== true)).toBe(true);
  });
});
