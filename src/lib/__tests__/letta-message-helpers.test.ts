/**
 * Tests for Letta Message Helpers (letta-message-helpers.ts)
 *
 * Covers:
 * - extractReasoning: reasoning field access, fallback to hidden_reasoning/content
 * - extractToolCall: tool_call field access, JSON.parse arguments, tool_call_id
 * - extractToolReturn: NEW SDK fields (name/tool_call_id/tool_return), array content parsing
 * - Streaming variants (extractReasoningFromEvent, etc.)
 *
 * 🔧 ARCH fix (Round 78): includes regression test for the tool_return_message bug
 *    where old code accessed msg.tool_call (nested) but SDK has top-level fields
 */

import { describe, it, expect } from 'vitest';
import {
  extractReasoning,
  extractToolCall,
  extractToolReturn,
  extractReasoningFromEvent,
  extractToolCallFromEvent,
  extractToolReturnFromEvent,
} from '@/lib/letta-message-helpers';

describe('extractReasoning', () => {
  it('extracts reasoning field', () => {
    expect(extractReasoning({ reasoning: 'thinking about this...' })).toBe('thinking about this...');
  });

  it('falls back to hidden_reasoning when reasoning is missing', () => {
    expect(extractReasoning({ hidden_reasoning: 'hidden thought' })).toBe('hidden thought');
  });

  it('falls back to content when reasoning and hidden_reasoning are missing', () => {
    expect(extractReasoning({ content: 'content as reasoning' })).toBe('content as reasoning');
  });

  it('prefers reasoning over hidden_reasoning and content', () => {
    expect(
      extractReasoning({
        reasoning: 'primary',
        hidden_reasoning: 'secondary',
        content: 'tertiary',
      }),
    ).toBe('primary');
  });

  it('prefers hidden_reasoning over content', () => {
    expect(
      extractReasoning({
        hidden_reasoning: 'secondary',
        content: 'tertiary',
      }),
    ).toBe('secondary');
  });

  it('returns empty string when all fields are missing', () => {
    expect(extractReasoning({})).toBe('');
  });

  it('returns empty string when reasoning is null', () => {
    expect(extractReasoning({ reasoning: null })).toBe('');
  });

  it('returns empty string when reasoning is undefined', () => {
    expect(extractReasoning({ reasoning: undefined })).toBe('');
  });

  it('handles empty reasoning string', () => {
    expect(extractReasoning({ reasoning: '' })).toBe('');
  });

  it('converts non-string reasoning to string', () => {
    expect(extractReasoning({ reasoning: 123 })).toBe('123');
  });

  it('converts non-string content to string when used as fallback', () => {
    expect(extractReasoning({ content: 456 })).toBe('456');
  });

  it('returns empty string when content is array (non-string)', () => {
    expect(extractReasoning({ content: ['not', 'a', 'string'] })).toBe('');
  });

  it('returns empty string when content is object', () => {
    expect(extractReasoning({ content: { foo: 'bar' } })).toBe('');
  });

  it('returns empty string when hidden_reasoning is null', () => {
    expect(extractReasoning({ hidden_reasoning: null })).toBe('');
  });
});

describe('extractToolCall', () => {
  it('extracts tool call with all fields', () => {
    const msg = {
      tool_call: {
        arguments: '{"x":1,"y":2}',
        name: 'create_challenge',
        tool_call_id: 'tc_123',
      },
    };
    const result = extractToolCall(msg);
    expect(result).toEqual({
      name: 'create_challenge',
      toolCallId: 'tc_123',
      args: { x: 1, y: 2 },
    });
  });

  it('returns null when tool_call is missing', () => {
    expect(extractToolCall({})).toBeNull();
  });

  it('returns null when tool_call is null', () => {
    expect(extractToolCall({ tool_call: null })).toBeNull();
  });

  it('returns null when name is empty', () => {
    expect(extractToolCall({ tool_call: { name: '', arguments: '{}', tool_call_id: 'tc_1' } })).toBeNull();
  });

  it('returns null when name is missing', () => {
    expect(extractToolCall({ tool_call: { arguments: '{}', tool_call_id: 'tc_1' } })).toBeNull();
  });

  it('uses msg.name as fallback when tool_call.name is missing', () => {
    const msg = {
      name: 'fallback_name',
      tool_call: { arguments: '{}', tool_call_id: 'tc_1' },
    };
    const result = extractToolCall(msg);
    expect(result?.name).toBe('fallback_name');
  });

  it('parses JSON string arguments', () => {
    const msg = {
      tool_call: {
        arguments: '{"key":"value","num":42}',
        name: 'tool',
        tool_call_id: 'tc_1',
      },
    };
    expect(extractToolCall(msg)?.args).toEqual({ key: 'value', num: 42 });
  });

  it('preserves raw arguments string when JSON.parse fails', () => {
    const msg = {
      tool_call: {
        arguments: 'not valid json',
        name: 'tool',
        tool_call_id: 'tc_1',
      },
    };
    expect(extractToolCall(msg)?.args).toEqual({ _raw: 'not valid json' });
  });

  it('handles object arguments (already parsed)', () => {
    const msg = {
      tool_call: {
        arguments: { already: 'parsed' },
        name: 'tool',
        tool_call_id: 'tc_1',
      },
    };
    expect(extractToolCall(msg)?.args).toEqual({ already: 'parsed' });
  });

  it('returns undefined args when arguments is null (ToolCallDelta)', () => {
    const msg = {
      tool_call: {
        arguments: null,
        name: 'tool',
        tool_call_id: 'tc_1',
      },
    };
    expect(extractToolCall(msg)?.args).toBeUndefined();
  });

  it('returns undefined args when arguments is missing', () => {
    const msg = {
      tool_call: {
        name: 'tool',
        tool_call_id: 'tc_1',
      },
    };
    expect(extractToolCall(msg)?.args).toBeUndefined();
  });

  it('uses tool_call.id as fallback when tool_call_id is missing', () => {
    const msg = {
      tool_call: {
        arguments: '{}',
        name: 'tool',
        id: 'fallback_id',
      },
    };
    expect(extractToolCall(msg)?.toolCallId).toBe('fallback_id');
  });

  it('returns undefined toolCallId when both tool_call_id and id are missing', () => {
    const msg = {
      tool_call: {
        arguments: '{}',
        name: 'tool',
      },
    };
    expect(extractToolCall(msg)?.toolCallId).toBeUndefined();
  });

  it('handles null tool_call_id (ToolCallDelta)', () => {
    const msg = {
      tool_call: {
        arguments: '{}',
        name: 'tool',
        tool_call_id: null,
      },
    };
    expect(extractToolCall(msg)?.toolCallId).toBeUndefined();
  });

  it('handles null name (ToolCallDelta)', () => {
    expect(
      extractToolCall({ tool_call: { name: null, arguments: '{}', tool_call_id: 'tc_1' } }),
    ).toBeNull();
  });
});

describe('extractToolReturn', () => {
  // 🔧 ARCH fix (Round 78) regression test: old code accessed msg.tool_call (nested)
  // but SDK ToolReturnMessage has top-level fields (name/tool_call_id/tool_return)
  it('REGRESSION: extracts from SDK ToolReturnMessage (top-level fields, NOT nested tool_call)', () => {
    // This is the actual SDK ToolReturnMessage shape
    const msg = {
      id: 'msg_1',
      date: '2026-01-01',
      status: 'success' as const,
      tool_call_id: 'tc_123',
      tool_return: 'Challenge created successfully',
      message_type: 'tool_return_message' as const,
      name: 'create_challenge',
    };
    const result = extractToolReturn(msg);
    expect(result).toEqual({
      name: 'create_challenge',
      toolCallId: 'tc_123',
      content: 'Challenge created successfully',
    });
  });

  it('returns null when name is missing', () => {
    expect(extractToolReturn({ tool_call_id: 'tc_1', tool_return: 'result' })).toBeNull();
  });

  it('returns null when name is null', () => {
    expect(extractToolReturn({ name: null, tool_call_id: 'tc_1', tool_return: 'result' })).toBeNull();
  });

  it('returns null when name is empty string', () => {
    expect(extractToolReturn({ name: '', tool_call_id: 'tc_1', tool_return: 'result' })).toBeNull();
  });

  it('extracts string tool_return', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call_id: 'tc_1',
      tool_return: 'simple string result',
    });
    expect(result?.content).toBe('simple string result');
  });

  it('extracts from tool_return array (MCP format: [{type:text, text:...}])', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call_id: 'tc_1',
      tool_return: [
        { type: 'text', text: 'part 1' },
        { type: 'text', text: 'part 2' },
      ],
    });
    expect(result?.content).toBe('part 1part 2');
  });

  it('concatenates multiple text parts in array tool_return', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call_id: 'tc_1',
      tool_return: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'World' }],
    });
    expect(result?.content).toBe('Hello World');
  });

  it('ignores non-text parts in array tool_return', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call_id: 'tc_1',
      tool_return: [
        { type: 'image', url: 'http://...' },
        { type: 'text', text: 'only text' },
        { foo: 'bar' },
      ],
    });
    expect(result?.content).toBe('only text');
  });

  it('falls back to content when tool_return is missing', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call_id: 'tc_1',
      content: 'fallback content',
    });
    expect(result?.content).toBe('fallback content');
  });

  it('falls back to content array when tool_return is missing', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call_id: 'tc_1',
      content: [{ type: 'text', text: 'fallback' }],
    });
    expect(result?.content).toBe('fallback');
  });

  it('falls back to tool_returns[0].tool_return (multi-tool format)', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_returns: [
        { tool_call_id: 'tc_1', tool_return: 'first return' },
      ],
    });
    expect(result?.content).toBe('first return');
  });

  it('returns empty content when all sources are missing', () => {
    const result = extractToolReturn({ name: 'tool', tool_call_id: 'tc_1' });
    expect(result?.content).toBe('');
  });

  it('uses tool_call_id from top-level', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call_id: 'tc_top',
      tool_return: 'result',
    });
    expect(result?.toolCallId).toBe('tc_top');
  });

  it('returns undefined toolCallId when tool_call_id is missing', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_return: 'result',
    });
    expect(result?.toolCallId).toBeUndefined();
  });

  it('defensive: falls back to tool_call.name (legacy SDK shape)', () => {
    // This tests the defensive fallback — if SDK ever reverts to nested tool_call
    const result = extractToolReturn({
      tool_call: { name: 'legacy_name', tool_call_id: 'legacy_id' },
      tool_return: 'legacy result',
    });
    expect(result).toEqual({
      name: 'legacy_name',
      toolCallId: 'legacy_id',
      content: 'legacy result',
    });
  });

  it('defensive: falls back to tool_call.tool_call_id when top-level is missing', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call: { tool_call_id: 'legacy_id' },
      tool_return: 'result',
    });
    expect(result?.toolCallId).toBe('legacy_id');
  });

  it('handles null tool_return', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call_id: 'tc_1',
      tool_return: null,
    });
    expect(result?.content).toBe('');
  });

  it('handles non-string, non-array tool_return (number)', () => {
    const result = extractToolReturn({
      name: 'tool',
      tool_call_id: 'tc_1',
      tool_return: 42,
    });
    expect(result?.content).toBe('');
  });
});

describe('extractReasoningFromEvent (streaming variant)', () => {
  it('extracts reasoning from streaming event', () => {
    expect(extractReasoningFromEvent({ reasoning: 'stream thought' })).toBe('stream thought');
  });

  it('falls back to content for streaming event', () => {
    expect(extractReasoningFromEvent({ content: 'stream content' })).toBe('stream content');
  });

  it('returns empty string for empty event', () => {
    expect(extractReasoningFromEvent({})).toBe('');
  });
});

describe('extractToolCallFromEvent (streaming variant)', () => {
  it('extracts tool call from streaming event', () => {
    const result = extractToolCallFromEvent({
      tool_call: {
        arguments: '{"x":1}',
        name: 'stream_tool',
        tool_call_id: 'tc_stream',
      },
    });
    expect(result).toEqual({
      name: 'stream_tool',
      toolCallId: 'tc_stream',
      args: { x: 1 },
    });
  });

  it('uses top-level name when tool_call is missing', () => {
    const result = extractToolCallFromEvent({
      name: 'top_level_name',
    });
    expect(result).toEqual({
      name: 'top_level_name',
      toolCallId: undefined,
      args: undefined,
    });
  });
});

describe('extractToolReturnFromEvent (streaming variant)', () => {
  it('extracts tool return from streaming event (top-level fields)', () => {
    const result = extractToolReturnFromEvent({
      name: 'stream_tool',
      tool_call_id: 'tc_stream',
      tool_return: 'stream result',
    });
    expect(result).toEqual({
      name: 'stream_tool',
      toolCallId: 'tc_stream',
      content: 'stream result',
    });
  });

  it('extracts tool return with array content (MCP format)', () => {
    const result = extractToolReturnFromEvent({
      name: 'stream_tool',
      tool_call_id: 'tc_stream',
      tool_return: [{ type: 'text', text: 'mcp result' }],
    });
    expect(result?.content).toBe('mcp result');
  });

  // 🔧 ARCH fix (Round 78) regression: streaming tool_return was also broken
  it('REGRESSION: streaming event uses top-level fields (not nested tool_call)', () => {
    // Old code: const eventAny = event as unknown as Record<string, unknown>;
    //          const toolCall = eventAny.tool_call as Record<string, unknown> | undefined;
    //          const toolName = (toolCall?.name as string) || '';
    // → toolName always '' because event.tool_call doesn't exist on ToolReturnMessage
    //
    // Fix: extractToolReturnFromEvent reads event.name directly
    const streamingEvent = {
      message_type: 'tool_return_message' as const,
      name: 'create_challenge',
      tool_call_id: 'tc_789',
      tool_return: 'Challenge created',
    };
    const result = extractToolReturnFromEvent(streamingEvent);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('create_challenge');
    expect(result?.toolCallId).toBe('tc_789');
    expect(result?.content).toBe('Challenge created');
  });
});

describe('integration: typical Letta message stream', () => {
  it('processes a typical multi-message response', () => {
    // Simulate a Letta response with reasoning + tool_call + tool_return + assistant_message
    const messages = [
      { message_type: 'reasoning_message', reasoning: 'User wants to create a challenge. I will call create_challenge.' },
      {
        message_type: 'tool_call_message',
        tool_call: {
          arguments: '{"title":"No shopping for 7 days","durationDays":7}',
          name: 'create_challenge',
          tool_call_id: 'tc_001',
        },
      },
      {
        message_type: 'tool_return_message',
        name: 'create_challenge',
        tool_call_id: 'tc_001',
        tool_return: 'Challenge created with ID ch_abc123',
      },
      { message_type: 'assistant_message', content: 'I created a 7-day challenge for you!' },
    ];

    let reasoning = '';
    let assistantReply = '';
    const toolCalls: Array<{ name: string; toolCallId?: string; args?: Record<string, unknown>; result?: string }> = [];

    for (const msg of messages) {
      if (msg.message_type === 'reasoning_message') {
        reasoning = extractReasoning(msg);
      } else if (msg.message_type === 'tool_call_message') {
        const call = extractToolCall(msg);
        if (call) {
          toolCalls.push({ name: call.name, toolCallId: call.toolCallId, args: call.args });
        }
      } else if (msg.message_type === 'tool_return_message') {
        const ret = extractToolReturn(msg);
        if (ret?.toolCallId) {
          const existing = toolCalls.find((tc) => tc.toolCallId === ret.toolCallId);
          if (existing) {
            existing.result = ret.content;
          }
        }
      } else if (msg.message_type === 'assistant_message') {
        assistantReply = typeof msg.content === 'string' ? msg.content : '';
      }
    }

    expect(reasoning).toBe('User wants to create a challenge. I will call create_challenge.');
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe('create_challenge');
    expect(toolCalls[0].toolCallId).toBe('tc_001');
    expect(toolCalls[0].args).toEqual({ title: 'No shopping for 7 days', durationDays: 7 });
    expect(toolCalls[0].result).toBe('Challenge created with ID ch_abc123');
    expect(assistantReply).toBe('I created a 7-day challenge for you!');
  });
});
