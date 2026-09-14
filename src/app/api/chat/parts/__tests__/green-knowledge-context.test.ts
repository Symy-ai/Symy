import { describe, expect, it } from 'vitest';

import { buildGreenKnowledge, greenKnowledgeSseEvent, withGreenKnowledgeEvent } from '../green-knowledge-context';

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe('buildGreenKnowledge (词条检索注入)', () => {
  it('命中: 上下文块含词条内容 + 禁止编造碳数值指令', () => {
    const { contextBlock, card } = buildGreenKnowledge('refurb 值得买吗', 'zh', 'on');
    expect(contextBlock).toContain('[GREEN KNOWLEDGE:');
    expect(contextBlock).toContain('翻新机');
    expect(contextBlock).toContain('官翻');
    expect(contextBlock).toContain('闲鱼');
    expect(contextBlock).toContain('Do NOT invent carbon footprint numbers');
    expect(card).not.toBeNull();
    expect(card!.entries[0].id).toBe('refurb_gadget');
    expect(card!.entries[0].label).toBe('翻新机');
    expect(card!.entries[0].options.length).toBeGreaterThanOrEqual(2);
  });

  it('命中: en locale → en 文案 (无中文)', () => {
    const { contextBlock, card } = buildGreenKnowledge('is buying refurbished worth it', 'en', 'on');
    expect(contextBlock).not.toMatch(/[\u4e00-\u9fff]/);
    expect(card!.entries[0].label).toBe('Refurbished');
    expect(card!.entries[0].why).not.toMatch(/[\u4e00-\u9fff]/);
  });

  it('购买意图: 不触发 (让位 green-alt-detect 链路)', () => {
    expect(buildGreenKnowledge('我想买个新的 iPad', 'zh', 'on').contextBlock).toBeNull();
    expect(buildGreenKnowledge('买 ivory 手镯靠谱吗', 'zh', 'on').card).toBeNull();
  });

  it('绿色守护关闭: 双 null (不检索, 零开销)', () => {
    const result = buildGreenKnowledge('refurb 值得买吗', 'zh', 'off');
    expect(result.contextBlock).toBeNull();
    expect(result.card).toBeNull();
  });

  it('未命中: 双 null', () => {
    const result = buildGreenKnowledge('今天天气怎么样', 'zh', 'on');
    expect(result.contextBlock).toBeNull();
    expect(result.card).toBeNull();
  });
});

describe('withGreenKnowledgeEvent (SSE 预注入)', () => {
  it('命中: 事件在最前, Letta 原始字节后透传', async () => {
    const { card } = buildGreenKnowledge('refurb 值得买吗', 'zh', 'on');
    const wrapped = withGreenKnowledgeEvent(sseStream(['data: {"type":"token","content":"hi"}\n\n']), card);
    const out = await readAll(wrapped);
    expect(out.startsWith('data: {"type":"green_knowledge"')).toBe(true);
    expect(out).toContain('"greenKnowledge"');
    expect(out).toContain('"token"');
  });

  it('未命中: 原样透传 (零包装)', async () => {
    const inner = sseStream(['data: {"type":"token","content":"hi"}\n\n']);
    const wrapped = withGreenKnowledgeEvent(inner, null);
    expect(wrapped).toBe(inner);
    await readAll(wrapped);
  });

  it('greenKnowledgeSseEvent: 事件字节以空行结尾 (SSE 协议)', () => {
    const { card } = buildGreenKnowledge('refurb 值得买吗', 'zh', 'on');
    const bytes = greenKnowledgeSseEvent(card!);
    const text = new TextDecoder().decode(bytes);
    expect(text.endsWith('\n\n')).toBe(true);
    expect(JSON.parse(text.slice(6, -2)).type).toBe('green_knowledge');
  });
});
