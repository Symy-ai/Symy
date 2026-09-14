/**
 * Tests for ZAI SDK Typed Wrappers (zai-sdk-types.ts)
 *
 * Covers:
 * - Type definitions (compile-time check via type assertions)
 * - callZAIChatCompletion: typed response, field access
 * - callZAIChatCompletionStream: typed stream
 * - Edge cases: null stream, error propagation
 *
 * Note: These tests mock createZAIClient to avoid real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock createZAIClient before importing the module under test
vi.mock('@/lib/z-ai-config', () => ({
  createZAIClient: vi.fn(),
}));

import { createZAIClient } from '@/lib/z-ai-config';
import {
  callZAIChatCompletion,
  callZAIChatCompletionStream,
  type ZAIChatCompletionResponse,
  type ZAIChatMessage,
  type ZAIToolCall,
  type ZAIChatChoice,
  type ZAIChatCompletionChunk,
} from '@/lib/zai-sdk-types';

// Type alias for the mocked function
const mockedCreateZAIClient = vi.mocked(createZAIClient);

describe('ZAI SDK type definitions (compile-time check)', () => {
  it('ZAIChatMessage type accepts all valid roles', () => {
    const msg: ZAIChatMessage = {
      role: 'system',
      content: 'system prompt',
    };
    expect(msg.role).toBe('system');

    const assistantMsg: ZAIChatMessage = {
      role: 'assistant',
      content: 'response',
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'tool', arguments: '{}' },
        },
      ],
    };
    expect(assistantMsg.tool_calls).toHaveLength(1);
  });

  it('ZAIChatMessage content can be null', () => {
    const msg: ZAIChatMessage = {
      role: 'assistant',
      content: null,
    };
    expect(msg.content).toBeNull();
  });

  it('ZAIToolCall has required fields', () => {
    const call: ZAIToolCall = {
      id: 'call_1',
      type: 'function',
      function: {
        name: 'create_challenge',
        arguments: '{"title":"test"}',
      },
    };
    expect(call.function.name).toBe('create_challenge');
    expect(call.function.arguments).toBe('{"title":"test"}');
  });

  it('ZAIChatChoice has required fields', () => {
    const choice: ZAIChatChoice = {
      index: 0,
      message: { role: 'assistant', content: 'hello' },
      finish_reason: 'stop',
    };
    expect(choice.index).toBe(0);
    expect(choice.finish_reason).toBe('stop');
  });

  it('ZAIChatCompletionResponse has required fields', () => {
    const response: ZAIChatCompletionResponse = {
      id: 'chatcmpl-abc',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [],
    };
    expect(response.object).toBe('chat.completion');
  });

  it('ZAIChatCompletionChunk has delta instead of message', () => {
    const chunk: ZAIChatCompletionChunk = {
      id: 'chatcmpl-abc',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          delta: { content: 'hello' },
          finish_reason: null,
        },
      ],
    };
    expect(chunk.choices[0]?.delta?.content).toBe('hello');
  });
});

describe('callZAIChatCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls SDK with messages and options, returns typed response', async () => {
    const mockResponse: ZAIChatCompletionResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello world' },
          finish_reason: 'stop',
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    const result = await callZAIChatCompletion(
      [{ role: 'user', content: 'Hi' }],
      { temperature: 0.7, maxTokens: 100 },
    );

    expect(result).toEqual(mockResponse);
    expect(result.choices[0]?.message?.content).toBe('Hello world');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('passes tools and toolChoice when provided', async () => {
    const mockResponse: ZAIChatCompletionResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'create_challenge', arguments: '{}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    const result = await callZAIChatCompletion(
      [{ role: 'user', content: 'Create a challenge' }],
      {
        tools: [
          {
            type: 'function',
            function: {
              name: 'create_challenge',
              description: 'Create a challenge',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        toolChoice: 'auto',
      },
    );

    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tool_choice).toBe('auto');
    expect(result.choices[0]?.message?.tool_calls).toHaveLength(1);
  });

  it('does not pass tools or tool_choice when not provided', async () => {
    const mockResponse: ZAIChatCompletionResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    await callZAIChatCompletion([{ role: 'user', content: 'Hi' }]);

    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.tools).toBeUndefined();
    expect(callArgs.tool_choice).toBeUndefined();
  });

  it('propagates SDK errors', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('API rate limit'));
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    await expect(callZAIChatCompletion([{ role: 'user', content: 'Hi' }])).rejects.toThrow(
      'API rate limit',
    );
  });

  it('handles empty choices array', async () => {
    const mockResponse: ZAIChatCompletionResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    const result = await callZAIChatCompletion([{ role: 'user', content: 'Hi' }]);
    expect(result.choices).toHaveLength(0);
    expect(result.choices[0]?.message?.content).toBeUndefined();
  });

  it('passes temperature and max_tokens to SDK', async () => {
    const mockResponse: ZAIChatCompletionResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    await callZAIChatCompletion(
      [{ role: 'user', content: 'Hi' }],
      { temperature: 0.5, maxTokens: 200 },
    );

    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.temperature).toBe(0.5);
    expect(callArgs.max_tokens).toBe(200);
  });

  it('passes undefined when options not provided', async () => {
    const mockResponse: ZAIChatCompletionResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    await callZAIChatCompletion([{ role: 'user', content: 'Hi' }]);

    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.temperature).toBeUndefined();
    expect(callArgs.max_tokens).toBeUndefined();
  });
});

describe('callZAIChatCompletionStream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ReadableStream when SDK returns non-null stream', async () => {
    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'));
        controller.close();
      },
    });

    const mockCreate = vi.fn().mockResolvedValue(mockStream);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    const result = await callZAIChatCompletionStream([{ role: 'user', content: 'Hi' }]);

    expect(result).toBeInstanceOf(ReadableStream);

    // Verify we can read from the stream
    const reader = result.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain('data:');
  });

  it('passes stream: true to SDK', async () => {
    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });

    const mockCreate = vi.fn().mockResolvedValue(mockStream);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    await callZAIChatCompletionStream([{ role: 'user', content: 'Hi' }]);

    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.stream).toBe(true);
  });

  it('throws when SDK returns null stream', async () => {
    const mockCreate = vi.fn().mockResolvedValue(null);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    await expect(
      callZAIChatCompletionStream([{ role: 'user', content: 'Hi' }]),
    ).rejects.toThrow('ZAI SDK returned null stream');
  });

  it('throws when SDK returns undefined stream', async () => {
    const mockCreate = vi.fn().mockResolvedValue(undefined);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    await expect(
      callZAIChatCompletionStream([{ role: 'user', content: 'Hi' }]),
    ).rejects.toThrow('ZAI SDK returned null stream');
  });

  it('propagates SDK errors', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('Network error'));
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    await expect(
      callZAIChatCompletionStream([{ role: 'user', content: 'Hi' }]),
    ).rejects.toThrow('Network error');
  });

  it('passes temperature and max_tokens to SDK', async () => {
    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });

    const mockCreate = vi.fn().mockResolvedValue(mockStream);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    await callZAIChatCompletionStream(
      [{ role: 'user', content: 'Hi' }],
      { temperature: 0.3, maxTokens: 50 },
    );

    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.temperature).toBe(0.3);
    expect(callArgs.max_tokens).toBe(50);
  });
});

describe('integration: typed field access on response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can safely access choices[0].message.content with type checking', async () => {
    const mockResponse: ZAIChatCompletionResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Typed access works' },
          finish_reason: 'stop',
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    const completion = await callZAIChatCompletion([{ role: 'user', content: 'Hi' }]);

    // This is the pattern that was previously `completion.choices?.[0]?.message?.content`
    // with `as any` — now it's fully typed
    const text = completion.choices?.[0]?.message?.content || '';
    expect(text).toBe('Typed access works');
  });

  it('can access tool_calls with type checking', async () => {
    const mockResponse: ZAIChatCompletionResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function' as const,
                function: {
                  name: 'create_challenge',
                  arguments: '{"title":"No shopping"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    const completion = await callZAIChatCompletion([{ role: 'user', content: 'Hi' }]);
    const toolCalls: ZAIToolCall[] | undefined = completion.choices?.[0]?.message?.tool_calls;

    expect(toolCalls).toBeDefined();
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls?.[0]?.function.name).toBe('create_challenge');
    expect(toolCalls?.[0]?.function.arguments).toBe('{"title":"No shopping"}');

    // Can safely parse arguments JSON
    const args = JSON.parse(toolCalls?.[0]?.function.arguments || '{}');
    expect(args).toEqual({ title: 'No shopping' });
  });

  it('handles missing tool_calls gracefully', async () => {
    const mockResponse: ZAIChatCompletionResponse = {
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'No tools needed' },
          finish_reason: 'stop',
        },
      ],
    };

    const mockCreate = vi.fn().mockResolvedValue(mockResponse);
    mockedCreateZAIClient.mockResolvedValue({
      chat: { completions: { create: mockCreate } },
    } as unknown as Awaited<ReturnType<typeof createZAIClient>>);

    const completion = await callZAIChatCompletion([{ role: 'user', content: 'Hi' }]);
    const toolCalls = completion.choices?.[0]?.message?.tool_calls;
    const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;

    expect(hasToolCalls).toBe(false);
  });
});
