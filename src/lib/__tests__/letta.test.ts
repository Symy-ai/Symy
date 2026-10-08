import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ——— mock 底座 ———
const messagesCreateMock = vi.fn();
vi.mock('@letta-ai/letta-client', () => {
  // 类必须内联在工厂内 (vi.mock hoisting 铁律)
  class MockLettaClient {
    agents = { messages: { create: (...a: unknown[]) => messagesCreateMock(...(a as [])) } };
  }
  return { default: MockLettaClient, Letta: MockLettaClient };
});
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const adminUpdateMock = vi.fn();
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: vi.fn(() => ({ supabase: { from: () => ({ update: () => ({ eq: () => adminUpdateMock() }) }) } })),
}));

import { sendToAgent, streamToAgent, isLettaConfigured } from '../letta';

function nonStreamingResponse(msgs: unknown[], usage?: Record<string, number>) {
  return { messages: msgs, usage };
}

describe('sendToAgent (letta 客户端核心)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('无 agentId: 拒绝 (强制 per-user agent)', async () => {
    await expect(sendToAgent('hi')).rejects.toThrow('No agent ID provided');
  });

  it('正常: assistant_message 提取 reply + usage 映射 snake→camel', async () => {
    messagesCreateMock.mockResolvedValue(nonStreamingResponse(
      [{ message_type: 'assistant_message', content: '你好, 我是 Symy.' }],
      { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, step_count: 2 },
    ));
    const r = await sendToAgent('hi', undefined, 'u-1', 'agent-1');
    expect(r.reply).toBe('你好, 我是 Symy.');
    expect(r.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, stepCount: 2 });
    expect(r.toolCalls).toBeUndefined();
  });

  it('content 数组形态 (Letta SDK 富文本) 拼接', async () => {
    messagesCreateMock.mockResolvedValue(nonStreamingResponse(
      [{ message_type: 'assistant_message', content: [{ text: 'part1' }, { text: 'part2' }] }],
    ));
    const r = await sendToAgent('hi', undefined, 'u-1', 'agent-1');
    expect(r.reply).toBe('part1part2');
  });

  it('空回复: mirror-mode fallback "I\'m here." (非探测问句)', async () => {
    messagesCreateMock.mockResolvedValue(nonStreamingResponse([]));
    const r = await sendToAgent('hi', undefined, 'u-1', 'agent-1');
    expect(r.reply).toBe("I'm here.");
  });

  it('tool_call + tool_return 按 toolCallId 配对 (R19 H1)', async () => {
    messagesCreateMock.mockResolvedValue(nonStreamingResponse([
      { message_type: 'tool_call_message', tool_call: { name: 'add_tokens', arguments: '{"amount":5}', tool_call_id: 'tc-1' } },
      { message_type: 'tool_return_message', name: 'add_tokens', tool_call_id: 'tc-1', tool_return: 'ok +5' },
      { message_type: 'assistant_message', content: 'done' },
    ]));
    const r = await sendToAgent('hi', undefined, 'u-1', 'agent-1');
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls![0]).toMatchObject({ name: 'add_tokens', toolCallId: 'tc-1', args: { amount: 5 }, result: 'ok +5' });
  });

  it('无 toolCallId: name fallback findLast 未配对 (避免覆盖)', async () => {
    messagesCreateMock.mockResolvedValue(nonStreamingResponse([
      { message_type: 'tool_call_message', tool_call: { name: 'dup_tool', arguments: '{}' } },
      { message_type: 'tool_call_message', tool_call: { name: 'dup_tool', arguments: '{}' } },
      { message_type: 'tool_return_message', name: 'dup_tool', tool_return: 'r2' },
    ]));
    const r = await sendToAgent('hi', undefined, 'u-1', 'agent-1');
    expect(r.toolCalls).toHaveLength(2);
    // findLast 找到第二个未配对的 → 第二个得 result
    expect(r.toolCalls![1].result).toBe('r2');
    expect(r.toolCalls![0].result).toBeUndefined();
  });

  it('404 stale agent: 清除 profiles.letta_agent_id 后重抛 (ARCH-8 #8)', async () => {
    messagesCreateMock.mockRejectedValue(new Error('Agent not found: agent-x'));
    await expect(sendToAgent('hi', undefined, 'u-1', 'agent-x')).rejects.toThrow('Agent not found');
    expect(adminUpdateMock).toHaveBeenCalledTimes(1);
  });

  it('非 404 错误: 不清 agent_id, 原样重抛', async () => {
    messagesCreateMock.mockRejectedValue(new Error('500 internal'));
    await expect(sendToAgent('hi', undefined, 'u-1', 'agent-x')).rejects.toThrow('500');
    expect(adminUpdateMock).not.toHaveBeenCalled();
  });

  it('signal 透传: 第三参 requestOptions 带 signal', async () => {
    messagesCreateMock.mockResolvedValue(nonStreamingResponse([{ message_type: 'assistant_message', content: 'x' }]));
    const ac = new AbortController();
    await sendToAgent('hi', undefined, 'u-1', 'agent-1', { signal: ac.signal });
    const thirdArg = messagesCreateMock.mock.calls[0][2] as { signal?: AbortSignal } | undefined;
    expect(thirdArg?.signal).toBe(ac.signal);
  });
});

describe('streamToAgent (SSE 流式)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  function makeSdkStream(events: unknown[]) {
    const stream = {
      async *[Symbol.asyncIterator]() { for (const e of events) yield e; },
      controller: { abort: vi.fn() },
    };
    return stream as unknown as AsyncIterable<unknown> & { controller: { abort: () => void } };
  }

  async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let out = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value, { stream: true });
    }
    return out;
  }

  it('无 agentId: 拒绝', async () => {
    await expect(streamToAgent('hi')).rejects.toThrow('No agent ID provided');
  });

  it('事件转换: reasoning/token/tool_call/tool_result/done 全链', async () => {
    messagesCreateMock.mockResolvedValue(makeSdkStream([
      { message_type: 'reasoning_message', reasoning: 'thinking...' },
      { message_type: 'assistant_message', content: 'Hello' },
      { message_type: 'tool_call_message', tool_call: { name: 'add_tokens' } },
      { message_type: 'tool_return_message', name: 'add_tokens', tool_return: '+5 ok' },
      { message_type: 'stop_reason' },
    ]));
    const stream = await streamToAgent('hi', undefined, 'u-1', 'agent-1');
    const out = await drain(stream);
    expect(out).toContain('"type":"reasoning","content":"thinking..."');
    expect(out).toContain('"type":"token","content":"Hello"');
    expect(out).toContain('"type":"tool_call","tool":"add_tokens"');
    expect(out).toContain('"type":"tool_result","tool":"add_tokens","content":"+5 ok"');
    expect(out.trim().endsWith('"type":"done"') || out.includes('"type":"done"')).toBe(true);
  });

  it('流错误: 真实错误透传 (BUG-1, 非硬编码 interrupted)', async () => {
    const boom = new Error('upstream exploded');
    boom.name = 'NotAbort';
    messagesCreateMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() { throw boom; },
      controller: { abort: vi.fn() },
    } as never);
    const stream = await streamToAgent('hi', undefined, 'u-1', 'agent-1');
    const out = await drain(stream);
    expect(out).toContain('"type":"error"');
    expect(out).toContain('upstream exploded');
    expect(out).not.toContain('Stream interrupted');
  });

  it('AbortError: 静默 (用户取消), 无 error 事件', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    messagesCreateMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() { throw abortErr; },
      controller: { abort: vi.fn() },
    } as never);
    const stream = await streamToAgent('hi', undefined, 'u-1', 'agent-1');
    const out = await drain(stream);
    expect(out).not.toContain('"type":"error"');
  });

  it('cancel(): 中止上游 controller (SSE C1 成本防漏)', async () => {
    const abortFn = vi.fn();
    const gated = new Promise<void>(() => {}); // 永不 resolve — 挂住迭代器等 cancel
    messagesCreateMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { message_type: 'assistant_message', content: 'tok1' };
        await gated; // 挂住等 cancel
      },
      controller: { abort: abortFn },
    } as never);
    const stream = await streamToAgent('hi', undefined, 'u-1', 'agent-1');
    const reader = stream.getReader();
    await reader.read(); // 拿到 tok1
    reader.releaseLock(); // 释放锁后才能 cancel (ReadableStream 语义)
    await stream.cancel();
    expect(abortFn).toHaveBeenCalledTimes(1);
  });
});

describe('isLettaConfigured', () => {
  it('返回布尔值 (env 决定, 不崩)', () => {
    expect(typeof isLettaConfigured()).toBe('boolean');
  });
});
