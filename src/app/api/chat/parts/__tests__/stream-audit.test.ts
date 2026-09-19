/**
 * stream-audit (wrapStreamWithAudit) — batch87-a 盲区补测
 *
 * 同一 SSE 流水线中 websearch-wait-stream 的外层相邻 part (websearch 包在其外,
 * canned 词因此不计入审计 aiOutput — 定位红线见 websearch-wait-stream.ts 头注释)。
 * 覆盖: 透传保真 / 完成态审计 (action 二态 + guest + 跨 chunk 撕裂 + 2000 截断) /
 * 失败态 (错误采集 + 不写行为审计) / 取消态传播 / 与 websearch 组合红线 (zh+en)。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), debug: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/ai-audit', () => ({
  logAIBehavior: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/posthog-server', () => ({
  captureLLMGeneration: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/admin-audit', () => ({
  fireAndForgetSafely: vi.fn((p: Promise<unknown>) => {
    p.catch(() => {});
  }),
}));

import { wrapStreamWithAudit } from '../stream-audit';
import { withWebSearchWaitEvent } from '../websearch-wait-stream';
import { buildWebSearchWaitTurn } from '@/lib/websearch-wait-turn';
import { logAIBehavior } from '@/lib/ai-audit';
import { captureLLMGeneration } from '@/lib/posthog-server';
import type { ChallengeContext } from '@/types/challenge-context';

const challenge: ChallengeContext = { itemName: '无人机', amount: 2999, challengeId: 'c-1' };

function sseStream(events: unknown[], chunkEvery = Infinity): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const bytes = encoder.encode(payload);
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkEvery, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
}

async function collectRaw(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

async function collectSseEvents(stream: ReadableStream<Uint8Array>): Promise<Record<string, unknown>[]> {
  return (await collectRaw(stream))
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('wrapStreamWithAudit — 透传保真', () => {
  it('原始字节逐字节直通: 非 data 行 / [DONE] / 坏 JSON 行 / token 事件全部原样', async () => {
    const payload = [
      'data: not-json\r',
      'data: {"type":"token","content":"你好"}',
      'data: [DONE]',
      '',
      '',
    ].join('\n');
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });

    const wrapped = wrapStreamWithAudit(source, '帮我比价', 'u1');
    const expected = await collectRaw(
      new ReadableStream<Uint8Array>({
        pull(c) {
          c.enqueue(new TextEncoder().encode(payload));
          c.close();
        },
      }),
    );
    await expect(collectRaw(wrapped)).resolves.toBe(expected);
  });

  it('流结束 → 正常 done (closeSSE 路径), 下游不 reject', async () => {
    const events = [{ type: 'token', content: 'ok' }];
    await expect(collectSseEvents(wrapStreamWithAudit(sseStream(events), 'q', 'u1'))).resolves.toEqual(events);
  });
});

describe('wrapStreamWithAudit — 完成态审计', () => {
  it('token 拼接进 aiOutput, action=tool_call, context 透传 impulseContext', async () => {
    const events = [
      { type: 'token', content: '你好' },
      { type: 'token', content: '世界' },
      { type: 'done' },
    ];
    await collectSseEvents(wrapStreamWithAudit(sseStream(events), '帮我比价', 'u1', { platform: 'taobao', amount: 99 }));

    expect(logAIBehavior).toHaveBeenCalledTimes(1);
    expect(logAIBehavior).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        action: 'tool_call',
        userInput: '帮我比价',
        aiOutput: '你好世界',
        aiPath: 'letta',
        context: { impulseContext: { platform: 'taobao', amount: 99 }, challengeContext: undefined },
      }),
    );
  });

  it('challengeContext 在场 → action=challenge_judge, posthog hasChallenge=true', async () => {
    const events = [{ type: 'token', content: '三思' }];
    await collectSseEvents(wrapStreamWithAudit(sseStream(events), '想买无人机', 'u1', undefined, challenge, 'agent-7'));

    expect(logAIBehavior).toHaveBeenCalledWith(expect.objectContaining({ action: 'challenge_judge' }));
    expect(captureLLMGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'u1',
        completionTokens: 1,
        properties: expect.objectContaining({ $ai_trace_id: 'agent-7', hasChallenge: true }),
      }),
    );
  });

  it('无 userId → 不写 logAIBehavior, posthog 归 guest', async () => {
    const events = [{ type: 'token', content: '你好' }];
    await collectSseEvents(wrapStreamWithAudit(sseStream(events), 'q', undefined));

    expect(logAIBehavior).not.toHaveBeenCalled();
    expect(captureLLMGeneration).toHaveBeenCalledWith(expect.objectContaining({ distinctId: 'guest' }));
  });

  it('事件跨 chunk 撕裂 (逐字节, 含中文) → 拼接恰好一次, token 数=事件数', async () => {
    const content = '绿色评分✓比价完成';
    const events = [
      { type: 'token', content },
      { type: 'token', content: '' },
      { type: 'token', content: '再补一句' },
    ];
    await collectSseEvents(wrapStreamWithAudit(sseStream(events, 1), 'q', 'u1'));

    expect(logAIBehavior).toHaveBeenCalledWith(expect.objectContaining({ aiOutput: content + '再补一句' }));
    expect(captureLLMGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ completionTokens: 2, output: content + '再补一句' }),
    );
  });

  it('input/output 超 2000 字符 → 截断到 2000', async () => {
    const events = [{ type: 'token', content: 'a'.repeat(2500) }];
    await collectSseEvents(wrapStreamWithAudit(sseStream(events), 'b'.repeat(2500), 'u1'));

    expect(captureLLMGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ input: 'b'.repeat(2000), output: 'a'.repeat(2000) }),
    );
    expect(logAIBehavior).toHaveBeenCalledWith(
      expect.objectContaining({ userInput: 'b'.repeat(2500), aiOutput: 'a'.repeat(2500) }),
    );
  });
});

describe('wrapStreamWithAudit — 失败态', () => {
  it('上游错误 → posthog isError 采集, 不写行为审计, 流对下游正常关闭', async () => {
    // error() 会清空已入队 chunk — 用 pull 分步: 先发部分数据, 下一次读再抛错
    let pulls = 0;
    const inner = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        if (pulls === 1) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"token","content":"部分"}\n\n'));
        } else {
          controller.error(new Error('upstream failed'));
        }
      },
    });

    const events = await collectSseEvents(wrapStreamWithAudit(inner, 'q', 'u1'));
    expect(events).toEqual([{ type: 'token', content: '部分' }]);

    expect(captureLLMGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        isError: true,
        errorMessage: 'upstream failed',
        output: '部分',
        properties: expect.objectContaining({ mode: 'stream-error' }),
      }),
    );
    expect(logAIBehavior).not.toHaveBeenCalled();
  });
});

describe('wrapStreamWithAudit — 取消态', () => {
  it('下游 cancel → 上游被取消 (reader.cancel 传播, 非 locked-stream TypeError)', async () => {
    let innerCancelled = false;
    const inner = new ReadableStream<Uint8Array>({
      cancel() {
        innerCancelled = true;
      },
    });

    const reader = wrapStreamWithAudit(inner, 'q', 'u1').getReader();
    await reader.cancel();

    expect(innerCancelled).toBe(true);
  });
});

describe('wrapStreamWithAudit × withWebSearchWaitEvent — 定位红线', () => {
  it('websearch 包在审计之外: 等待话术注入但 aiOutput 不含 canned 词 (zh/en i18n key 均在)', async () => {
    const fallback = JSON.stringify({ data_source: 'websearch', data: { cards: [{ product_ref: 'p1', title: '商品', price_cents: 9900, currency: 'CNY' }] } });
    const events = [
      { type: 'tool_result', tool: 'symy_search', content: fallback },
      { type: 'token', content: '找到这些：' },
    ];

    for (const locale of ['zh', 'en'] as const) {
      const waitTurn = buildWebSearchWaitTurn('不锈钢吸管', locale);
      expect(waitTurn.reply.length).toBeGreaterThan(0);

      const audited = wrapStreamWithAudit(sseStream(events), '问一问', 'u1');
      const out = await collectSseEvents(withWebSearchWaitEvent(audited, waitTurn));

      expect(out.map((e) => e.type)).toEqual(['tool_result', 'token', 'token']);
      expect(out[1]).toEqual({ type: 'token', content: waitTurn.reply });
      expect(logAIBehavior).toHaveBeenCalledWith(
        expect.objectContaining({ aiOutput: '找到这些：' }),
      );
      const recorded = vi.mocked(logAIBehavior).mock.calls[0][0];
      expect(recorded.aiOutput).not.toContain(waitTurn.reply);
      vi.clearAllMocks();
    }
  });
});
