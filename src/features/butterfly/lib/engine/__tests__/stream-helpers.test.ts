import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  transformLettaStreamToStoryStream,
  isToolCallEvent,
  extractTextFromLettaSSELine,
  truncateAtSentence,
} from '../stream-helpers';

function makeLettaStream(lines: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(c) { for (const l of lines) c.enqueue(enc.encode(l)); c.close(); },
  });
}

type StoryEvent = { type: string; data: Record<string, unknown> };

async function drain(stream: ReadableStream<Uint8Array>): Promise<StoryEvent[]> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out.split('\n\n').filter(Boolean).map(l => JSON.parse(l.replace(/^data: /, '')));
}

const token = (t: string) => `data: ${JSON.stringify({ type: 'token', content: t })}\n\n`;

describe('transformLettaStreamToStoryStream', () => {
  it('token 事件 → chapter_text 逐个转发 + chapter_end 带全量文本', async () => {
    const out = await drain(transformLettaStreamToStoryStream(
      makeLettaStream([token('Hello '), token('world.')]), 2,
    ));
    expect(out.map(e => e.type)).toEqual(['chapter_text', 'chapter_text', 'chapter_end']);
    expect(out[0].data).toEqual({ chapterIndex: 2, text: 'Hello ' });
    expect((out[2].data as unknown as { fullText: string }).fullText).toBe('Hello world.');
  });

  it('tool_call/tool_result 事件被滤除 (violation 只 warn 不中断)', async () => {
    const out = await drain(transformLettaStreamToStoryStream(
      makeLettaStream([
        'data: {"type":"tool_call","tool":"add_tokens"}\n\n',
        token('story continues'),
        'data: {"type":"tool_result","tool":"add_tokens","content":"ok"}\n\n',
      ]), 1,
    ));
    const texts = out.filter((e: StoryEvent) => e.type === 'chapter_text');
    expect(texts).toHaveLength(1);
    expect((out[out.length - 1].data as unknown as { fullText: string }).fullText).toBe('story continues');
  });

  it('reasoning/done/error 事件被忽略 (只 token 进文本)', async () => {
    const out = await drain(transformLettaStreamToStoryStream(
      makeLettaStream([
        'data: {"type":"reasoning","content":"thinking"}\n\n',
        token('visible'),
        'data: {"type":"done"}\n\n',
      ]), 1,
    ));
    expect(out.filter((e: StoryEvent) => e.type === 'chapter_text')).toHaveLength(1);
  });

  it('跨 chunk 截断: 行缓冲拼接', async () => {
    const enc = new TextEncoder();
    const raw = token('abc') + token('def');
    const mid = Math.floor(raw.length / 2);
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(enc.encode(raw.slice(0, mid))); c.enqueue(enc.encode(raw.slice(mid))); c.close(); },
    });
    const out = await drain(transformLettaStreamToStoryStream(stream, 1));
    expect(out.filter((e: StoryEvent) => e.type === 'chapter_text').map((e: StoryEvent) => (e.data as unknown as { text: string }).text)).toEqual(['abc', 'def']);
  });

  it('cleanAgentReply 兜底: markdown 前缀被清 (R19 H2-audit2)', async () => {
    const out = await drain(transformLettaStreamToStoryStream(
      makeLettaStream([token("Here's the chapter:\n```json\n{\"x\":1}\n```\nThe room glowed.")]), 1,
    ));
    const end = out.find((e: StoryEvent) => e.type === 'chapter_end')!;
    const fullText = (end.data as unknown as { fullText: string }).fullText;
    // prose 模式不清代码块但清前缀 — 锁前缀移除
    expect(fullText).not.toContain("Here's the chapter:");
  });

  it('流错误: error 事件 + 上游 reader cancel (M2 泄漏防护)', async () => {
    const boom = new ReadableStream<Uint8Array>({
      start(c) { c.error(new Error('upstream died')); },
    });
    const out = await drain(transformLettaStreamToStoryStream(boom, 1));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('error');
    expect((out[0].data as unknown as { message: string }).message).toBe('upstream died');
  });

  it('cancel(): 上游 reader 被中止 (ARCH-8 #2 成本防漏)', async () => {
    const upstreamCancel = vi.fn();
    const gate = new Promise<void>(() => {}); // 永不 resolve — 挂住 pull
    const upstream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new TextEncoder().encode(token('tok')));
        return gate; // 挂住 pull
      },
      cancel: upstreamCancel,
    });
    const out = transformLettaStreamToStoryStream(upstream, 1);
    const reader = out.getReader();
    await reader.read(); // tok1
    reader.releaseLock();
    await out.cancel();
    expect(upstreamCancel).toHaveBeenCalled();
  });
});

describe('isToolCallEvent', () => {
  it('tool_call/tool_result 真; token/reasoning/done/非SSE/坏JSON 假', () => {
    expect(isToolCallEvent('data: {"type":"tool_call"}')).toBe(true);
    expect(isToolCallEvent('data: {"type":"tool_result"}')).toBe(true);
    expect(isToolCallEvent('data: {"type":"token","content":"x"}')).toBe(false);
    expect(isToolCallEvent('data: {"type":"reasoning"}')).toBe(false);
    expect(isToolCallEvent('data: [DONE]')).toBe(false);
    expect(isToolCallEvent('not sse')).toBe(false);
    expect(isToolCallEvent('data: {broken')).toBe(false);
  });
});

describe('extractTextFromLettaSSELine', () => {
  it('token+string content → 文本; 其他全空', () => {
    expect(extractTextFromLettaSSELine('data: {"type":"token","content":"hi"}')).toBe('hi');
    expect(extractTextFromLettaSSELine('data: {"type":"token","content":123}')).toBe(''); // 非字符串
    expect(extractTextFromLettaSSELine('data: {"type":"reasoning","content":"x"}')).toBe('');
    expect(extractTextFromLettaSSELine('data: [DONE]')).toBe('');
    expect(extractTextFromLettaSSELine('random')).toBe('');
  });
});

describe('truncateAtSentence (M6 句子边界)', () => {
  it('短文本原样', () => {
    expect(truncateAtSentence('short.', 100)).toBe('short.');
  });

  it('句号截断: 句读在 >40% 位', () => {
    // 句号在第 17 位, maxLen 30 → 17 > 12 (40%) → 句边界截断
    const text = 'aaaaaaaaaaaaaaaa. bbbbbbbbbbbbbbbbbbbbbb cccccc';
    const r = truncateAtSentence(text, 30);
    expect(r).toBe('aaaaaaaaaaaaaaaa.');
  });

  it('无句读: 空格截断 + ...', () => {
    const r = truncateAtSentence('aaaa bbbb cccc dddd eeee ffff gggg', 20);
    expect(r.endsWith('...')).toBe(true);
    expect(r.length).toBeLessThanOrEqual(23);
  });

  it('完全无空格: 硬截 + ...', () => {
    const r = truncateAtSentence('x'.repeat(50), 10);
    expect(r).toBe('x'.repeat(10) + '...');
  });
});
