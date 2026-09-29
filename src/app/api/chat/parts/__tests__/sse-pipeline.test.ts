/**
 * sse-pipeline — 第23刀相位级单测 (字节序核心)
 *
 * 搬移自 route.ts:468-496 (SSE 包装栈)。两层断言:
 *
 * 1. 包装调用顺序 (mock wrapper, 忠实 null 直通): 实际发生包装的调用序必须为
 *    audit → websearch → reuse → green → knowledge → footprint → micro
 *    ("谁后包装谁更靠前" — 包装调用序 = 事件字节序的源码级体现)。
 *    mock wrapper 在流头部注入自身标记事件, 末尾读全文 — 调用序反着印在
 *    字节里逐一断言。(prependReuseHintEvent 被 reuse 与 micro 两处复用,
 *    tag 按调用次序编号 reuse#1/#2 区分。)
 *
 * 2. 真实 wrapper 全命中 (vi.doUnmock 重载真实模块): 五卡齐发, 断言输出
 *    事件序 + Letta 原生事件逐字节透传 — "纯机械搬移" 的字节级机验。
 *    实测字节序: micro_challenge 最前 (每层注入器先 enqueue 自身事件再泵
 *    内层 → 最外层包装 micro 的事件字节最前), 与 route 旧注释 "micro 排最后"
 *    相左 — 此处锁实际行为 (= 搬移前行为, 前端按 type 独立消费不依赖卡间序)。
 *
 * 不真连 Letta: innerStream 由测试构造 (方案 §4 刀 23)。
 * 外部边界 mock 与 route-sse-bytes.test.ts 同源 (logger/审计/PostHog —
 * 真实 stream-audit 在第 2 层触达)。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const encoder = new TextEncoder();
  /** 实际发生包装的调用序 (null 直通不记录 — 锁的是包装链, 不是函数调用) */
  const CALL_ORDER: string[] = [];
  /** mock 包装器: 在流头部注入自身标记事件 (用于"包装调用序反印在字节里"断言) */
  function tagStream(inner: ReadableStream<Uint8Array>, tag: string): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tag })}\n\n`));
        const reader = inner.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        } finally {
          reader.releaseLock();
        }
      },
    });
  }
  function recorded(name: string, inner: ReadableStream<Uint8Array>, tag: string): ReadableStream<Uint8Array> {
    CALL_ORDER.push(name);
    return tagStream(inner, tag);
  }
  return { CALL_ORDER, recorded };
});

vi.mock('../stream-audit', () => ({
  wrapStreamWithAudit: vi.fn(
    (inner: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> => h.recorded('wrapStreamWithAudit', inner, 'audit'),
  ),
}));
vi.mock('../websearch-wait-stream', () => ({
  withWebSearchWaitEvent: vi.fn(
    (inner: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> =>
      h.recorded('withWebSearchWaitEvent', inner, 'websearch'),
  ),
}));
// 卡片包装 mock 忠实于真实实现: payload null → 原流直通 (不记录、不注入)
vi.mock('../green-alt-detect', () => ({
  withGreenAltEvent: vi.fn(
    (inner: ReadableStream<Uint8Array>, payload: unknown): ReadableStream<Uint8Array> =>
      payload ? h.recorded('withGreenAltEvent', inner, 'green') : inner,
  ),
}));
vi.mock('../green-knowledge-context', () => ({
  withGreenKnowledgeEvent: vi.fn(
    (inner: ReadableStream<Uint8Array>, payload: unknown): ReadableStream<Uint8Array> =>
      payload ? h.recorded('withGreenKnowledgeEvent', inner, 'knowledge') : inner,
  ),
}));
vi.mock('../alt-adoption-context', () => ({
  withAltFootprintEvent: vi.fn(
    (inner: ReadableStream<Uint8Array>, payload: unknown): ReadableStream<Uint8Array> =>
      payload ? h.recorded('withAltFootprintEvent', inner, 'footprint') : inner,
  ),
}));
vi.mock('../reuse-detect', () => ({
  reuseHintSseEvent: vi.fn(() => ({ type: 'reuse_hint' })),
  // 管道只在真命中时调用本注入器 (ternary/if 守卫) — 每次调用都是真包装
  prependReuseHintEvent: vi.fn((inner: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> =>
    h.recorded('prependReuseHintEvent', inner, `reuse#${h.CALL_ORDER.filter((x) => x === 'prependReuseHintEvent').length}`)),
}));
vi.mock('../micro-challenge-detector', () => ({
  microChallengeSseEvent: vi.fn(() => ({ type: 'micro_challenge' })),
}));
// 外部边界 (真实 stream-audit 在第 2 层测试中触达, 与 route-sse-bytes.test.ts 同源)
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/ai-audit', () => ({
  logAIBehavior: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/admin-audit', () => ({
  fireAndForgetSafely: vi.fn((p: Promise<unknown>) => {
    p.catch(() => {});
  }),
}));
vi.mock('@/lib/posthog-server', () => ({
  captureLLMGeneration: vi.fn().mockResolvedValue(undefined),
}));

import { buildSsePipeline, type SsePipelineInput } from '../sse-pipeline';
import { prependReuseHintEvent } from '../reuse-detect';
import { microChallengeSseEvent } from '../micro-challenge-detector';

const encoder = new TextEncoder();

function nativeStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"token","content":"hi"}\n\n'));
      controller.close();
    },
  });
}

function baseInput(overrides: Record<string, unknown> = {}): SsePipelineInput {
  return {
    innerStream: nativeStream(),
    userContent: 'hi',
    userId: 'u1',
    locale: 'en',
    impulseContext: undefined,
    validChallengeContext: undefined,
    targetAgentId: 'agent-1',
    greenAltCard: null,
    reuseHint: null,
    microChallenge: null,
    greenKnowledge: { contextBlock: '', card: null },
    altFootprintCard: null,
    ...overrides,
  } as SsePipelineInput;
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  let out = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.CALL_ORDER.length = 0;
});

describe('sse-pipeline — 包装调用顺序 (mock wrapper)', () => {
  it('全命中: 包装序 audit → websearch → reuse → green → knowledge → footprint → micro', async () => {
    const input = baseInput({
      greenAltCard: { id: 'electronics', why: 'w', options: ['a'], reuse: 'r', reuseChannel: 'c' },
      reuseHint: { shouldSuggestReuse: true, category: 'books', categoryLabel: 'Books', suggestions: ['x'] },
      microChallenge: { category: 'electronics', titleKey: 'chat.microChallenge.body.electronics', durationHours: 24 },
      greenKnowledge: {
        contextBlock: '',
        card: { entries: [{ id: 'fast-fashion', label: 'Fast Fashion', why: 'w', options: ['a'], reuseChannel: 'c' }] },
      },
      altFootprintCard: {
        public: { totalAdoptions: 1, last30Days: 1, categoriesCovered: 1, topEntries: [] },
        private: { savedEstimate: 0 },
      },
    });

    const text = await drain(buildSsePipeline(input));

    // 实际发生包装的调用序 = 包装链 ("谁后包装谁更靠前")
    expect(prependReuseHintEvent).toHaveBeenCalledTimes(2); // reuse 预注入 + micro 预注入
    expect(microChallengeSseEvent).toHaveBeenCalledTimes(1);
    expect(h.CALL_ORDER).toEqual([
      'wrapStreamWithAudit',
      'withWebSearchWaitEvent',
      'prependReuseHintEvent', // reuse (第 3 层)
      'withGreenAltEvent',
      'withGreenKnowledgeEvent',
      'withAltFootprintEvent',
      'prependReuseHintEvent', // micro (最后包装 → 最外层)
    ]);

    // tag 注入序 = 包装序的逆序: micro(第 2 次 reuse 注入) 最外层 → tag 最前;
    // audit 最内层 → 倒数第二; Letta 原生事件在全部标记之后逐字节透传
    // (mock 工厂内 tag 计数取 CALL_ORDER.push 前的旧值: 第 1 次包装 tag=reuse#0,
    //  第 2 次 (micro) 包装 tag=reuse#1 — 两个编号即两次包装的次序证)
    const tags = [...text.matchAll(/"tag":"([\w#]+)"/g)].map((m) => m[1]);
    expect(tags).toEqual(['reuse#1', 'footprint', 'knowledge', 'green', 'reuse#0', 'websearch', 'audit']);
    expect(text.endsWith('data: {"type":"token","content":"hi"}\n\n')).toBe(true);
  });

  it('全空: 只走 audit + websearch 必经层, 卡片零注入 (null 直通)', async () => {
    const text = await drain(buildSsePipeline(baseInput()));

    // 管道对 null 卡仍调用 with*Event (直通语义), 但不发生包装; 守卫内的注入器零调用
    expect(prependReuseHintEvent).not.toHaveBeenCalled();
    expect(microChallengeSseEvent).not.toHaveBeenCalled();
    expect(h.CALL_ORDER).toEqual(['wrapStreamWithAudit', 'withWebSearchWaitEvent']);

    const tags = [...text.matchAll(/"tag":"([\w#]+)"/g)].map((m) => m[1]);
    expect(tags).toEqual(['websearch', 'audit']);
    expect(text.endsWith('data: {"type":"token","content":"hi"}\n\n')).toBe(true);
  });
});

describe('sse-pipeline — 真实 wrapper 全命中 (字节级)', () => {
  it('真实包装链 (零 mock): micro 最前 → footprint → knowledge → green → reuse → Letta 原生逐字节透传', async () => {
    vi.resetModules();
    // 解除 parts 层 mock (doUnmock 对其后动态 import 生效); 外部边界 lib 保持 mock
    vi.doUnmock('../stream-audit');
    vi.doUnmock('../websearch-wait-stream');
    vi.doUnmock('../green-alt-detect');
    vi.doUnmock('../green-knowledge-context');
    vi.doUnmock('../alt-adoption-context');
    vi.doUnmock('../reuse-detect');
    vi.doUnmock('../micro-challenge-detector');
    const { buildSsePipeline: realPipeline } = await import('../sse-pipeline');

    const greenAltCard = {
      id: 'electronics',
      why: 'Mining rare metals is heavy.',
      options: ['Buy refurbished'],
      reuse: 'You may already have one.',
      reuseChannel: 'Local secondhand',
    };
    const reuseHint = {
      shouldSuggestReuse: true,
      category: 'books',
      categoryLabel: 'Books',
      suggestions: ['Reread your shelf'],
      reuseHonestNote: 'note',
    };
    const microChallenge = {
      category: 'electronics',
      titleKey: 'chat.microChallenge.body.electronics',
      durationHours: 24 as const,
    };
    const greenKnowledge = {
      contextBlock: '',
      card: { entries: [{ id: 'fast-fashion', label: 'Fast Fashion', why: 'w', options: ['a'], reuseChannel: 'c' }] },
    };
    const altFootprintCard = {
      public: { totalAdoptions: 2, last30Days: 1, categoriesCovered: 1, topEntries: [] },
      private: { savedEstimate: 0 },
    };

    const body = realPipeline(baseInput({ greenAltCard, reuseHint, microChallenge, greenKnowledge, altFootprintCard }));
    const text = await drain(body);

    // 事件字节序 (实测=搬移前行为): 每层注入器先 enqueue 自身事件再泵内层 →
    // 最外层包装 micro 的事件排最前; websearch 等待话术未触发 (无 tool_result) 不出现
    const lines = text.split('\n\n').filter(Boolean);
    const types = lines.map((l) => JSON.parse(l.replace(/^data: /, '')).type);
    expect(types).toEqual(['micro_challenge', 'alt_footprint', 'green_knowledge', 'green_alt', 'reuse_hint', 'token']);
    // Letta 原生事件逐字节透传
    expect(lines[lines.length - 1]).toBe('data: {"type":"token","content":"hi"}');
  });
});
