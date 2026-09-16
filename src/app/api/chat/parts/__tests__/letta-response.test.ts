/**
 * letta-response — 非流式响应归一化契约 (batch77-b)
 *
 * - reply/reasoning/toolCalls 透传归一化 (正常形状)
 * - toolCalls 畸形/缺失容错不抛 (缺失/空数组/null/缺 name)
 * - 「挑战中但 AI 未调工具」仅记日志监控, 不触发补偿
 *   (compensation 已彻底移除, 钉语义防回潮)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processLettaResponse } from '../letta-response';
import { sendToAgent, type LettaChatResponse } from '@/lib/letta';
import { logger } from '@/lib/logger';
import type { ChallengeContext } from '../types';

vi.mock('@/lib/letta', () => ({ sendToAgent: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const CHALLENGE: ChallengeContext = { itemName: 'Drone', amount: 499, challengeId: 'ch-1' };

function mockAgentResponse(overrides: Partial<LettaChatResponse> = {}) {
  vi.mocked(sendToAgent).mockResolvedValue({ reply: 'ok', ...overrides } as LettaChatResponse);
}

describe('归一化 (正常形状)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reply/reasoning/toolCalls 透传; 调了工具 → 记录工具名日志', async () => {
    mockAgentResponse({
      reasoning: 'because',
      toolCalls: [
        { name: 'log_challenge_completed', args: { amount: 499 }, result: 'done' },
        { name: 'record_savings', args: {}, result: 'ok' },
      ],
    });
    const result = await processLettaResponse('hello');
    expect(result).toEqual({
      reply: 'ok',
      reasoning: 'because',
      toolCalls: [
        { name: 'log_challenge_completed', args: { amount: 499 }, result: 'done' },
        { name: 'record_savings', args: {}, result: 'ok' },
      ],
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('log_challenge_completed, record_savings'),
    );
  });

  it('参数透传给 sendToAgent (userMessage/impulseContext/userId/agentId)', async () => {
    mockAgentResponse();
    const impulse = { platform: 'taobao', amount: 42, reasons: ['flash sale'], time: '23:00' };
    await processLettaResponse('msg', impulse, 'u1', 'agent-9');
    expect(sendToAgent).toHaveBeenCalledWith('msg', impulse, 'u1', 'agent-9');

    await processLettaResponse('bare');
    expect(sendToAgent).toHaveBeenLastCalledWith('bare', undefined, undefined, undefined);
  });
});

describe('toolCalls 畸形/缺失容错', () => {
  beforeEach(() => vi.clearAllMocks());

  it('缺失 (undefined) / 空数组 → 原样返回, 不记工具日志', async () => {
    mockAgentResponse({ toolCalls: undefined });
    const missing = await processLettaResponse('m');
    expect(missing.toolCalls).toBeUndefined();
    expect(logger.info).not.toHaveBeenCalled();

    mockAgentResponse({ toolCalls: [] });
    const empty = await processLettaResponse('m');
    expect(empty.toolCalls).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('null / 元素缺 name / 非 string name → 不抛, 原样透传', async () => {
    mockAgentResponse({ toolCalls: null as unknown as LettaChatResponse['toolCalls'] });
    const nullCalls = await processLettaResponse('m');
    expect(nullCalls.toolCalls).toBeNull();
    expect(logger.info).not.toHaveBeenCalled();

    mockAgentResponse({ toolCalls: [{ name: undefined as unknown as string }, { name: 42 as unknown as string }] });
    const malformed = await processLettaResponse('m');
    expect(malformed.toolCalls).toEqual([{ name: undefined }, { name: 42 }]);
  });

  it('reasoning 缺省 → undefined, 不抛', async () => {
    mockAgentResponse();
    const result = await processLettaResponse('m');
    expect(result.reasoning).toBeUndefined();
  });
});

describe('挑战中未调工具 → 仅日志, 无补偿 (compensation 已移除)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('挑战活跃 + 无工具调用 → 记 no compensation 日志, 不执行任何补偿副作用', async () => {
    mockAgentResponse({ toolCalls: undefined });
    const result = await processLettaResponse('想买无人机', { platform: 'taobao' }, 'u1', 'agent-9', CHALLENGE);

    expect(result.reply).toBe('ok');
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('no compensation (by design)'),
    );
    const logged = vi.mocked(logger.info).mock.calls[0]![0] as string;
    expect(logged).toContain('Drone');
    expect(logged).toContain('499');
    // 补偿已移除: 不允许 warn/error 级别干预, sendToAgent 仅此一次调用
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(sendToAgent).toHaveBeenCalledTimes(1);
  });

  it('挑战活跃 + 调了工具 → 只记工具日志, 不出现 no compensation', async () => {
    mockAgentResponse({ toolCalls: [{ name: 'log_challenge_completed' }] });
    await processLettaResponse('m', undefined, 'u1', 'agent-9', CHALLENGE);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('called tools'));
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('no compensation'));
  });

  it('无挑战 + 无工具调用 → 静默', async () => {
    mockAgentResponse({ toolCalls: undefined });
    await processLettaResponse('m');
    expect(logger.info).not.toHaveBeenCalled();
  });
});
