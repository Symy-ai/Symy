/**
 * generateButterflySummary signal 透传契约 (batch96-c)
 *
 * complete-story 已覆盖 AbortController 行为，但旧实现把 summary mock 掉，
 * story-engine 到 letta 的真实接线仍缺防伪断言。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/letta', () => ({
  isLettaConfigured: vi.fn(() => true),
  sendToAgent: vi.fn(() => Promise.resolve({ reply: '  A clean reflection.  ' })),
  streamToAgent: vi.fn(),
}));

vi.mock('@/lib/letta-agent-manager', () => ({
  getUserAgentId: vi.fn(() => Promise.resolve('agent-summary-1')),
}));

import { sendToAgent } from '@/lib/letta';
import { generateButterflySummary } from '../story-engine';
import type { ButterflySession } from '../../types';

const mockedSendToAgent = vi.mocked(sendToAgent);

function session(): ButterflySession {
  return {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    userId: 'user-summary-1',
    decisionType: 'bought',
    decisionDescription: 'a discounted course',
    amount: 199,
    platform: null,
    context: null,
    outline: null,
    currentChapter: 1,
    chapters: [],
    choices: [],
    butterflyEffect: null,
    finalTone: null,
    status: 'active',
    createdAt: '2026-09-19T00:00:00Z',
    updatedAt: '2026-09-19T00:00:00Z',
  };
}

describe('generateButterflySummary signal wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the optional trailing signal to sendToAgent and cleans the reply', async () => {
    const controller = new AbortController();

    await expect(generateButterflySummary(
      session(),
      session().userId,
      'saving for tuition',
      controller.signal,
    )).resolves.toBe('A clean reflection.');

    expect(mockedSendToAgent).toHaveBeenCalledTimes(1);
    expect(mockedSendToAgent).toHaveBeenCalledWith(
      expect.stringContaining('[BUTTERFLY EFFECT - SUMMARY MODE]'),
      undefined,
      session().userId,
      'agent-summary-1',
      { signal: controller.signal },
    );
  });

  it('keeps the fourth argument optional so legacy calls omit request options', async () => {
    await expect(generateButterflySummary(session(), session().userId)).resolves.toBe('A clean reflection.');

    expect(mockedSendToAgent).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      session().userId,
      'agent-summary-1',
      undefined,
    );
  });
});
