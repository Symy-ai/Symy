import { describe, expect, it } from 'vitest';
import { withWebSearchWaitEvent } from '../websearch-wait-stream';
import { buildWebSearchWaitTurn } from '@/lib/websearch-wait-turn';
import type { ProductCardData } from '@/types/product-card';

/** mock 工具返回按 product-tool-result.ts 既有形状 (letta.ts tool_result SSE 事件) */
const card = (ref: string): ProductCardData => ({
  product_ref: ref,
  title: `商品${ref}`,
  price_cents: 9900,
  currency: 'CNY',
});

const fallbackContent = (cards: ProductCardData[]) =>
  JSON.stringify({ data_source: 'websearch', data: { cards } });

function toolResultEvent(content: string): Record<string, unknown> {
  return { type: 'tool_result', tool: 'symy_search', content };
}

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

async function collectSseEvents(stream: ReadableStream<Uint8Array>): Promise<Record<string, unknown>[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

const waitTurn = buildWebSearchWaitTurn('不锈钢吸管', 'zh');

describe('withWebSearchWaitEvent — 触发形态', () => {
  it('fallback tool_result (<2 卡 + websearch) → 紧跟其后注入等待话术, 且先于后续 LLM token', async () => {
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      { type: 'token', content: '找到这些：' },
      { type: 'done' },
    ];
    const out = await collectSseEvents(withWebSearchWaitEvent(sseStream(events), waitTurn));
    expect(out.map((e) => e.type)).toEqual(['tool_result', 'token', 'token', 'done']);
    expect(out[1]).toEqual({ type: 'token', content: waitTurn.reply });
    expect(out[2]).toEqual({ type: 'token', content: '找到这些：' });
  });

  it('两次 fallback tool_result 只发一次话术', async () => {
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      toolResultEvent(fallbackContent([card('p2')])),
      { type: 'token', content: 'ok' },
    ];
    const out = await collectSseEvents(withWebSearchWaitEvent(sseStream(events), waitTurn));
    const waitTokens = out.filter((e) => e.type === 'token' && e.content === waitTurn.reply);
    expect(waitTokens).toHaveLength(1);
  });

  it('事件跨 chunk 撕裂 (逐 7 字节) 仍正确注入一次', async () => {
    const events = [
      toolResultEvent(fallbackContent([card('p1')])),
      { type: 'token', content: '结果' },
    ];
    const out = await collectSseEvents(withWebSearchWaitEvent(sseStream(events, 7), waitTurn));
    expect(out.map((e) => e.type)).toEqual(['tool_result', 'token', 'token']);
    expect(out[1]).toEqual({ type: 'token', content: waitTurn.reply });
  });

  it('SSE cards 通道 1 张 (content 无 cards) → 触发', async () => {
    const event = { type: 'tool_result', tool: 'symy_search', content: '{"data_source":"websearch"}', cards: [card('p1')] };
    const out = await collectSseEvents(withWebSearchWaitEvent(sseStream([event]), waitTurn));
    expect(out[1]).toEqual({ type: 'token', content: waitTurn.reply });
  });
});

describe('withWebSearchWaitEvent — 不触发形态 (行为=现状)', () => {
  it('≥2 卡 → 原流直通, 无话术', async () => {
    const events = [
      toolResultEvent(fallbackContent([card('p1'), card('p2')])),
      { type: 'token', content: '找到这些：' },
    ];
    const out = await collectSseEvents(withWebSearchWaitEvent(sseStream(events), waitTurn));
    expect(out.map((e) => e.type)).toEqual(['tool_result', 'token']);
  });

  it('契约字段缺失 (data_source 不在) → 原流直通', async () => {
    const content = JSON.stringify({ data: { cards: [card('p1')] } });
    const events = [toolResultEvent(content), { type: 'token', content: 'x' }];
    const out = await collectSseEvents(withWebSearchWaitEvent(sseStream(events), waitTurn));
    expect(out.filter((e) => e.content === waitTurn.reply)).toHaveLength(0);
  });

  it('非搜索工具的 tool_result → 原流直通', async () => {
    const event = { type: 'tool_result', tool: 'record_impulse', content: '{"ok":1}' };
    const out = await collectSseEvents(withWebSearchWaitEvent(sseStream([event]), waitTurn));
    expect(out).toEqual([event]);
  });

  it('无 tool_result 的普通流 → 逐事件原样透传', async () => {
    const events = [
      { type: 'token', content: '你好' },
      { type: 'reasoning', content: 'thinking' },
      { type: 'done' },
    ];
    const out = await collectSseEvents(withWebSearchWaitEvent(sseStream(events), waitTurn));
    expect(out).toEqual(events);
  });

  it('上游错误 → 向下游传播', async () => {
    const inner = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          `data: ${JSON.stringify(toolResultEvent(fallbackContent([card('p1')])))}\n\n`,
        ));
        controller.error(new Error('upstream failed'));
      },
    });

    await expect(collectSseEvents(withWebSearchWaitEvent(inner, waitTurn))).rejects.toThrow('upstream failed');
  });

  it('下游取消 → 取消上游', async () => {
    let cancelReason: unknown;
    const inner = new ReadableStream<Uint8Array>({
      cancel(reason) {
        cancelReason = reason;
      },
    });
    const wrapped = withWebSearchWaitEvent(inner, waitTurn);
    const reader = wrapped.getReader();

    await reader.cancel('consumer stopped');

    expect(cancelReason).toBe('consumer stopped');
  });
});
