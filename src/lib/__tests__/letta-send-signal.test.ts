/**
 * sendToAgent request-option compatibility contract (batch96-c)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendToAgent, type LettaChatResponse } from '../letta';

const observedSignals: AbortSignal[] = [];
const fetchMock = vi.fn((_: string, init?: RequestInit) => {
  if (init?.signal) observedSignals.push(init.signal);
  return Promise.resolve(new Response(JSON.stringify({
    messages: [
      { message_type: 'assistant_message', content: 'A considered reply.' },
    ],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
      step_count: 2,
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } }));
});

vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
process.env.LETTA_API_KEY = 'test-letta-key';
process.env.LETTA_BASE_URL = '';

const response: LettaChatResponse = {
  reply: 'A considered reply.',
  usage: {
    promptTokens: 11,
    completionTokens: 7,
    totalTokens: 18,
    stepCount: 2,
  },
};

describe('sendToAgent request options', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    observedSignals.length = 0;
  });

  it('passes an AbortSignal through the SDK request-options argument', async () => {
    const controller = new AbortController();

    await expect(sendToAgent('hello', undefined, 'user-1', 'agent-1', {
      signal: controller.signal,
    })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(observedSignals).toHaveLength(1);
    expect(observedSignals[0].aborted).toBe(false);
    controller.abort();
    expect(observedSignals[0].aborted).toBe(true);
  });

  it('keeps legacy no-option calls free of an AbortSignal', async () => {
    await expect(sendToAgent('hello', undefined, 'user-1', 'agent-1'))
      .resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(observedSignals).toHaveLength(1);
  });
});
