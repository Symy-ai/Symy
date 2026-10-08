import { describe, expect, it, vi } from 'vitest';
import { consumeAIStream } from '../consume-ai-stream';

function sseStream(events: unknown[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.close();
    },
  });
}

function interruptedSseStream() {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: 'Partial' })}\n\n`));
    },
  });
  return {
    read: () => stream.getReader(),
    fail: (error = new TypeError('network dropped')) => controller.error(error),
  };
}

describe('consumeAIStream product results', () => {
  it('attaches symy_search cards', async () => {
    let cards: unknown[] = [];
    const result = await consumeAIStream(
      sseStream([{ type: 'tool_result', tool: 'symy_search', content: JSON.stringify({ data: { cards: [{ product_ref: 'p1', title: 'Liquor', price_cents: 32800, currency: 'CNY' }] } }) }]).getReader(),
      new TextDecoder(),
      { onProductCards: (parsed) => { cards = parsed; } },
    );
    expect(result.errorDisplayed).toBe(false);
    expect(cards).toHaveLength(1);
  });

  it('does not attach other tools and tolerates bad JSON', async () => {
    let attached = false;
    await consumeAIStream(sseStream([
      { type: 'tool_result', tool: 'other_tool', content: JSON.stringify({ data: { cards: [{ product_ref: 'p1', title: 'x', price_cents: 1, currency: 'CNY' }] } }) },
      { type: 'tool_result', tool: 'symy_search', content: '{bad' },
    ]).getReader(), new TextDecoder(), { onProductCards: () => { attached = true; } });
    expect(attached).toBe(false);
  });

  // 🔧 A1 移植 (commerce-agents "UI 组件即工具"): 结构化 cards 通道 + 旧字符串轨 fallback
  it('prefers the structured cards channel when present', async () => {
    let cards: unknown[] = [];
    await consumeAIStream(sseStream([
      // 结构化通道存在时, content 即使不是合法 JSON 也不影响取卡
      { type: 'tool_result', tool: 'symy_search', content: 'unparseable', cards: [{ product_ref: 'p1', title: 'Liquor', price_cents: 32800, currency: 'CNY' }] },
    ]).getReader(), new TextDecoder(), { onProductCards: (parsed) => { cards = parsed; } });
    expect(cards).toHaveLength(1);
  });

  it('drops hostile entries arriving on the structured channel', async () => {
    let cards: unknown[] = [];
    await consumeAIStream(sseStream([
      {
        type: 'tool_result', tool: 'symy_search', content: 'unparseable',
        cards: [
          { product_ref: 'p\nevil', title: 'x', price_cents: 1, currency: 'CNY' }, // ref 含注入换行 → 丢
          { product_ref: 'p2', title: 'ok', price_cents: 2, currency: 'CNY' },
        ],
      },
    ]).getReader(), new TextDecoder(), { onProductCards: (parsed) => { cards = parsed; } });
    expect(cards).toHaveLength(1);
    expect((cards as Array<{ product_ref: string }>)[0].product_ref).toBe('p2');
  });

  it('does not fall back to string parsing when a structured channel exists but validates empty', async () => {
    let attached = false;
    await consumeAIStream(sseStream([
      // cards 字段存在 (空数组) → 结构化通道权威, 不得再从 content 字符串解析复活坏卡
      { type: 'tool_result', tool: 'symy_search', content: JSON.stringify({ data: { cards: [{ product_ref: 'p1', title: 'x', price_cents: 1, currency: 'CNY' }] } }), cards: [] },
    ]).getReader(), new TextDecoder(), { onProductCards: () => { attached = true; } });
    expect(attached).toBe(false);
  });
});

// 🔧 P0 信任修复: reasoning 与 content 严格分流 — reasoning 只进 reasoning 通道,
//    气泡正文 (reply) 只收 token 事件, 防思考过程泄漏进聊天气泡。
describe('consumeAIStream reasoning/content separation', () => {
  it('keeps reasoning events out of reply when followed by content events', async () => {
    const result = await consumeAIStream(
      sseStream([
        { type: 'reasoning', content: 'The user says they want to buy a jacket. ' },
        { type: 'reasoning', content: 'I should respond in Chinese.' },
        { type: 'token', content: '这件外套' },
        { type: 'token', content: '值得一次看见。' },
        { type: 'done' },
      ]).getReader(),
      new TextDecoder(),
      {},
    );
    expect(result.reply).toBe('这件外套值得一次看见。');
    expect(result.reasoning).toBe('The user says they want to buy a jacket. I should respond in Chinese.');
    expect(result.reply).not.toContain('The user');
    expect(result.errorDisplayed).toBe(false);
  });

  it('drops null/empty reasoning and token contents without corrupting either channel', async () => {
    const result = await consumeAIStream(
      sseStream([
        { type: 'reasoning', content: null },
        { type: 'token', content: null },
        { type: 'reasoning', content: 'thinking…' },
        { type: 'token', content: '正文' },
      ]).getReader(),
      new TextDecoder(),
      {},
    );
    expect(result.reply).toBe('正文');
    expect(result.reasoning).toBe('thinking…');
  });

  it('keeps received tokens when the SSE reader drops mid-stream', async () => {
    const interrupted = interruptedSseStream();
    const reader = interrupted.read();
    const consumed = consumeAIStream(reader, new TextDecoder(), {});
    await vi.waitFor(() => interrupted.fail());
    const result = await consumed;

    expect(result).toMatchObject({ reply: 'Partial', readerError: true, errorDisplayed: false });
    expect(result.readerError).toBe(true);
  });

  it('still rejects AbortError so callers preserve their explicit-cancel behavior', async () => {
    const interrupted = interruptedSseStream();
    const reader = interrupted.read();
    const consumed = consumeAIStream(reader, new TextDecoder(), {});
    await vi.waitFor(() => interrupted.fail(new DOMException('aborted', 'AbortError')));

    await expect(consumed).rejects.toThrow('aborted');
  });
});

// 🔧 R71 fix 行为锁: idleTimeout 标志语义 — 正常 done 不置位 / 真超时置位
describe('consumeAIStream idleTimeout semantics', () => {
  it('normal stream completion does NOT set idleTimeout (even with zero tokens)', async () => {
    // 空事件流立即 close —— 旧 bug: done=true 也置 idleTimeout=true, 调用方误显「流中断」兜底
    const result = await consumeAIStream(
      sseStream([]).getReader(),
      new TextDecoder(),
      {},
    );
    expect(result.idleTimeout).toBe(false);
    expect(result.reply).toBe('');
  });

  it('a genuinely stalled stream sets idleTimeout after the idle window', async () => {
    vi.useFakeTimers();
    try {
      // 永不 enqueue 也永不 close 的流 — 只有 idle timeout 能结束它
      const stream = new ReadableStream<Uint8Array>({ start() { /* stall forever */ } });
      const promise = consumeAIStream(stream.getReader(), new TextDecoder(), {});
      const assertion = promise.then((result) => {
        expect(result.idleTimeout).toBe(true);
      });
      // 逐拍推进到 60s idle 窗口（链式 timer: 每轮 read 重新起 60s timer）
      for (let i = 0; i < 130; i++) await vi.advanceTimersByTimeAsync(1000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
