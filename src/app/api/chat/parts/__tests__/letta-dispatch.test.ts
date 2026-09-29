/**
 * letta-dispatch — 第24刀相位级单测 (拆相位收官刀)
 *
 * 搬移自 route.ts:451-608 (Letta 分发整段 try/catch)。四象限断言 (方案 §4 刀 24):
 *
 * ① 流式成功 → SSE Response (真实包装栈, SSE_HEADERS 四件套, 字节透传)
 * ② 流式抛错 → SSE 错误流 (BUG-188: 非流式错误流…见下) 含退款文案分支
 * ③ 非流式成功 → JSON 形状 (reply/reasoning/toolCalls + 5 个可选卡片字段命中与否)
 * ④ 非流式抛错 → null + captureLLMGeneration(isError) 被调
 *
 * 简报象限④原文写 "logAIBehavior + captureLLMGeneration 被调", 但实测搬移前
 * catch 块只调 captureLLMGeneration (logAIBehavior 仅在非流式成功路径)。纯机械
 * 搬移红线 = 锁真实行为, 本测试断言 captureLLMGeneration; logAIBehavior 成功
 * 路径在象限③覆盖。
 *
 * 外部边界 mock 与 route-sse-bytes.test.ts 同源 (lib/letta + 审计三件套);
 * sse-pipeline / letta-response / @/lib/sse 保持真实 — 走真实包装栈与真实
 * processLettaResponse, 与 route 级快照同一判定面。
 * vi.spyOn(logger) 断言错误分类分级日志 (401/403 error / 429 warn / 5xx error /
 * 无 status warn)。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/letta', () => ({
  streamToAgent: vi.fn(),
  sendToAgent: vi.fn(/* eslint-disable require-await -- mock 为 API 形状一致性, 与 route-sse-bytes.test.ts 同惯例 */ async () => ({ reply: 'letta reply', reasoning: 'r1', toolCalls: [] })),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/ai-audit', () => ({
  logAIBehavior: vi.fn(/* eslint-disable require-await -- mock 为 API 形状一致性 */ async () => true),
}));
vi.mock('@/lib/posthog-server', () => ({
  captureLLMGeneration: vi.fn(/* eslint-disable require-await -- mock 为 API 形状一致性 */ async () => undefined),
}));
vi.mock('@/lib/admin-audit', () => ({
  fireAndForgetSafely: vi.fn((p: Promise<unknown>) => {
    p.catch(() => {});
  }),
}));
vi.mock('../refund-challenge-quota', () => ({
  // catch 退款项 — helper 本体有 refund-challenge-quota.test.ts 12 例专测,
  // 此处锁 dispatch 的消费契约: refunded → 分文案
  refundChallengeQuota: vi.fn(async () => ({ refunded: true })),
}));

import { dispatchLettaTurn, type LettaDispatchInput } from '../letta-dispatch';
import { streamToAgent } from '@/lib/letta';
import { logger } from '@/lib/logger';
import { captureLLMGeneration } from '@/lib/posthog-server';
import { logAIBehavior } from '@/lib/ai-audit';

const encoder = new TextEncoder();

/** Letta 原生 SSE 字节流 (streamToAgent 返回形状) */
function lettaSseStream(events: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
  const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function baseInput(overrides: Partial<LettaDispatchInput> = {}): LettaDispatchInput {
  return {
    userContent: 'Hi',
    userContentWithStage: '[Context: cultivation_stage: zhi_yu | locale: en]\n\n<message>Hi</message>',
    userId: 'u-dispatch',
    locale: 'en',
    stream: false,
    impulseContext: undefined,
    validChallengeContext: undefined,
    targetAgentId: 'agent-dispatch-1',
    requestStartTime: Date.now() - 10,
    mergeCookiesOnResponse: (res: Response) => res,
    lettaCultivationStage: 'zhi_yu',
    lettaUserHistory: undefined,
    greenAltCard: null,
    reuseHint: null,
    microChallenge: null,
    greenKnowledge: { contextBlock: '', card: null },
    altFootprintCard: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('① 流式成功 → SSE Response (真实包装栈)', () => {
  it('SSE_HEADERS 四件套 + Letta 原生事件逐字节透传 (audit/websearch/五卡 null 包装零改写)', async () => {
    const events = [
      { type: 'reasoning', content: 'pondering' },
      { type: 'token', content: 'Hello' },
      { type: 'done' },
    ];
    vi.mocked(streamToAgent).mockResolvedValue(lettaSseStream(events));

    const res = await dispatchLettaTurn(baseInput({ stream: true }));

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get('content-type')).toBe('text/event-stream');
    expect(res!.headers.get('cache-control')).toBe('no-cache');
    expect(res!.headers.get('connection')).toBe('keep-alive');
    expect(res!.headers.get('x-accel-buffering')).toBe('no');
    expect(streamToAgent).toHaveBeenCalledTimes(1);
    expect(streamToAgent).toHaveBeenCalledWith(
      '[Context: cultivation_stage: zhi_yu | locale: en]\n\n<message>Hi</message>',
      undefined,
      'u-dispatch',
      'agent-dispatch-1',
    );

    const bytes = await res!.text();
    expect(bytes).toBe(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''));
    // 流式路径不走非流式审计落库 (logAIBehavior 的流式侧由真实 stream-audit
    // wrapper 在流消费时触发 — 字节透传断言已覆盖包装零改写, 此处不重复锁)
  });
});

describe('② 流式抛错 → SSE 错误流 (退款文案分支)', () => {
  it('无挑战 → 通用错误文案 + [DONE], 内联两件套 headers (非 SSE_HEADERS 四件套)', async () => {
    vi.mocked(streamToAgent).mockRejectedValue(new Error('Letta unavailable'));

    const res = await dispatchLettaTurn(baseInput({ stream: true }));

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get('content-type')).toBe('text/event-stream');
    expect(res!.headers.get('cache-control')).toBe('no-cache');
    // 现状契约: 错误流 headers 为内联两件套 (搬移前 route.ts 内联写法原样保留)
    expect(res!.headers.get('connection')).toBeNull();
    expect(res!.headers.get('x-accel-buffering')).toBeNull();

    const bytes = await res!.text();
    expect(bytes).toBe(
      'data: {"type":"error","content":"AI service temporarily unavailable. Please try again."}\n\n' +
        'data: [DONE]\n\n',
    );
    // 错误分类日志: 无 status → warn
    expect(logger.warn).toHaveBeenCalledWith('[Chat API] Letta agent failed:', 'Letta unavailable');
  });

  it('带挑战 → 挑战退款文案 (challenge create 已扣 See-it, 失败须告知退款)', async () => {
    vi.mocked(streamToAgent).mockRejectedValue(new Error('Letta unavailable'));
    const { refundChallengeQuota } = await import('../refund-challenge-quota');

    const res = await dispatchLettaTurn(baseInput({
      stream: true,
      validChallengeContext: { itemName: 'milk tea', amount: 15, challengeId: 'ch-1' },
    }));

    expect(refundChallengeQuota).toHaveBeenCalledWith('u-dispatch');
    expect(res).not.toBeNull();
    const bytes = await res!.text();
    expect(bytes).toContain('Your See-it was refunded');
  });
});

describe('③ 非流式成功 → JSON 形状 (5 个可选卡片字段)', () => {
  it('全未命中: reply/reasoning/toolCalls 透传, 卡片字段整体省略', async () => {
    const res = await dispatchLettaTurn(baseInput());

    expect(res).not.toBeNull();
    expect(res!.status).toBe(200);
    expect(res!.headers.get('content-type')).toBe('application/json');
    const body = await res!.json();
    expect(body).toEqual({ reply: 'letta reply', reasoning: 'r1', toolCalls: [] });
    // 非流式成功: 审计落库双通道被调 (fire-and-forget)
    expect(logAIBehavior).toHaveBeenCalledTimes(1);
    expect(captureLLMGeneration).toHaveBeenCalledTimes(1);
    expect(captureLLMGeneration).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: 'u-dispatch',
      properties: expect.objectContaining({ mode: 'non-stream' }),
    }));
  });

  it('五卡全命中: greenAlt 恒出现 (null→undefined), 其余四字段按命中展开', async () => {
    const res = await dispatchLettaTurn(baseInput({
      greenAltCard: { id: 'electronics', why: 'w', options: ['a'], reuse: 'r', reuseChannel: 'c' },
      reuseHint: { shouldSuggestReuse: true, category: 'books_media', categoryLabel: 'Books', suggestions: ['x'] },
      microChallenge: { category: 'electronics', titleKey: 'chat.microChallenge.body.electronics', durationHours: 24 },
      greenKnowledge: { contextBlock: '', card: { entries: [{ id: 'fast-fashion', label: 'Fast Fashion', why: 'w', options: ['a'], reuseChannel: 'c' }] } },
      altFootprintCard: {
        public: { totalAdoptions: 1, last30Days: 1, categoriesCovered: 1, topEntries: [] },
        private: { savedEstimate: 0 },
      },
    }));

    const body = await res!.json();
    expect(body.greenAlt).toEqual({ id: 'electronics', why: 'w', options: ['a'], reuse: 'r', reuseChannel: 'c' });
    expect(body.reuseHint).toEqual({ shouldSuggestReuse: true, category: 'books_media', categoryLabel: 'Books', suggestions: ['x'] });
    expect(body.microChallenge).toEqual({ category: 'electronics', titleKey: 'chat.microChallenge.body.electronics', durationHours: 24 });
    expect(body.greenKnowledge).toEqual({ entries: [{ id: 'fast-fashion', label: 'Fast Fashion', why: 'w', options: ['a'], reuseChannel: 'c' }] });
    expect(body.altFootprint).toEqual({ public: { totalAdoptions: 1, last30Days: 1, categoriesCovered: 1, topEntries: [] }, private: { savedEstimate: 0 } });
  });
});

describe('④ 非流式抛错 → null + 错误采集', () => {
  it('sendToAgent reject → 返回 null, captureLLMGeneration(isError) 被调, 分级日志正确', async () => {
    const { sendToAgent } = await import('@/lib/letta');
    vi.mocked(sendToAgent).mockRejectedValue(Object.assign(new Error('upstream 503'), { status: 503 }));

    const res = await dispatchLettaTurn(baseInput());

    expect(res).toBeNull();
    expect(captureLLMGeneration).toHaveBeenCalledTimes(1);
    expect(captureLLMGeneration).toHaveBeenCalledWith(expect.objectContaining({
      isError: true,
      errorMessage: 'upstream 503',
      properties: expect.objectContaining({ mode: 'non-stream-error' }),
    }));
    // 错误分类: 5xx → error 级 (Round 69 Finding 10)
    expect(logger.error).toHaveBeenCalledWith('[Chat API] Letta server error (503):', 'upstream 503');
    // 纯机械搬移契约: catch 不落 logAIBehavior (简报象限④与现状不符, 见头注释)
    expect(logAIBehavior).not.toHaveBeenCalled();
  });

  it('错误分类分级: 401/403 → error, 429 → warn, 无 status → warn', async () => {
    const { sendToAgent } = await import('@/lib/letta');

    for (const [status, level] of [[401, 'error'], [403, 'error'], [429, 'warn'], [undefined, 'warn']] as const) {
      vi.clearAllMocks();
      vi.mocked(sendToAgent).mockRejectedValue(Object.assign(new Error(`fail ${status ?? 'none'}`), status !== undefined ? { status } : {}));
      await dispatchLettaTurn(baseInput());
      if (level === 'error') {
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.warn).not.toHaveBeenCalled();
      } else {
        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.error).not.toHaveBeenCalled();
      }
    }
  });
});
