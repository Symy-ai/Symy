/**
 * run-channel-turn.test — 渠道回合核心（设计 §6.2 编排序）
 *
 * 全依赖 mock（chat parts 是 Web 主链, 单测不碰真 Letta/DB）：
 * 锁定编排序 + 同键配额 + text-only 输出（reasoning 绝不外发）+
 * fire-and-forget 审计/PostHog + 各 outcome 文案。
 *
 * 链形状按 run-channel-turn.ts 源码调用序搭（坑 118）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUserAgentId = vi.fn();
const getChatProfileSnapshot = vi.fn();
const checkRateLimit = vi.fn();
const loadLettaTurnContext = vi.fn();
const processLettaResponse = vi.fn();
const logAIBehavior = vi.fn();
const fireAndForgetSafely = vi.fn();
const captureLLMGeneration = vi.fn();
const createAdminClient = vi.fn();

vi.mock('@/lib/letta-agent-manager', () => ({
  getUserAgentId: (userId: string) => getUserAgentId(userId),
}));

vi.mock('@/lib/distributed-lock', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock('@/app/api/chat/parts/chat-profile-snapshot', () => ({
  getChatProfileSnapshot: (userId: string) => getChatProfileSnapshot(userId),
}));

vi.mock('@/app/api/chat/parts/letta-turn-context', () => ({
  loadLettaTurnContext: (input: unknown) => loadLettaTurnContext(input),
}));

vi.mock('@/app/api/chat/parts/letta-response', () => ({
  processLettaResponse: (...args: unknown[]) => processLettaResponse(...args),
}));

vi.mock('@/lib/agent-stream', () => ({
  stripLeakedReasoning: vi.fn((text: string) => text),
}));

vi.mock('@/lib/ai-audit', () => ({
  logAIBehavior: (entry: unknown) => logAIBehavior(entry),
}));

vi.mock('@/lib/admin-audit', () => ({
  fireAndForgetSafely: (promise: Promise<unknown>) => fireAndForgetSafely(promise),
}));

vi.mock('@/lib/posthog-server', () => ({
  captureLLMGeneration: (params: unknown) => captureLLMGeneration(params),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => createAdminClient(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runChannelTurn, CHANNEL_TURN_TEXTS } from '../run-channel-turn';

function baseSetup() {
  getUserAgentId.mockReset().mockResolvedValue('agent-1');
  getChatProfileSnapshot.mockReset().mockResolvedValue({ plan: 'free', timezone: null, hourlyRate: null });
  checkRateLimit.mockReset().mockResolvedValue({ allowed: true, remaining: 49 });
  loadLettaTurnContext.mockReset().mockResolvedValue({ userContentWithStage: 'ctx-staged' });
  processLettaResponse.mockReset().mockResolvedValue({ reply: '(reply)', reasoning: '(reasoning)', toolCalls: [] });
  logAIBehavior.mockReset().mockResolvedValue(true);
  fireAndForgetSafely.mockReset();
  captureLLMGeneration.mockReset().mockResolvedValue(undefined);
  createAdminClient.mockReset().mockReturnValue({ supabase: {}, error: null });
}

describe('runChannelTurn — 正常回合（编排序锁定）', () => {
  beforeEach(baseSetup);

  it('配额检查在 LLM 之前; 同键 chat:daily/chat:user; 返回 text-only 回复', async () => {
    const result = await runChannelTurn({ userId: 'u-1', locale: 'zh', text: '帮我参谋' });

    expect(result).toEqual({ outcome: 'replied', replyText: '(reply)' });
    // 编排序: agent → 配额 → context → LLM
    const order = [
      getUserAgentId.mock.invocationCallOrder[0],
      checkRateLimit.mock.invocationCallOrder[0],
      loadLettaTurnContext.mock.invocationCallOrder[0],
      processLettaResponse.mock.invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // 同键共享 — 与 Web 字面量逐字节一致
    expect(checkRateLimit).toHaveBeenCalledWith('chat:daily:u-1', 50, 24 * 60 * 60 * 1000);
    expect(checkRateLimit).toHaveBeenCalledWith('chat:user:u-1', 30, 60 * 60 * 1000);
    // LLM 入参走 loadLettaTurnContext 产物 + agentId
    expect(processLettaResponse).toHaveBeenCalledWith('ctx-staged', undefined, 'u-1', 'agent-1', undefined);
  });

  it('premium 用户跳过 daily 配额但保留 hourly 窗', async () => {
    getChatProfileSnapshot.mockResolvedValue({ plan: 'premium', timezone: null, hourlyRate: null });
    await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    const keys = checkRateLimit.mock.calls.map((c) => c[0]);
    // premium 不吃免费档 daily, 但全局熔断闸 (M1, §8) 对所有人生效
    expect(keys).toEqual(['chat:user:u-1', 'channel:global:daily']);
  });

  it('审计与 PostHog 是 fire-and-forget (不 await, 不阻塞回合)', async () => {
    await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    expect(fireAndForgetSafely).toHaveBeenCalledTimes(2);
    expect(logAIBehavior).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-1', action: 'tool_call' }));
    expect(captureLLMGeneration).toHaveBeenCalledWith(expect.objectContaining({ distinctId: 'u-1' }));
  });

  it('locale=en 时英文文案外发', async () => {
    getUserAgentId.mockResolvedValue(null);
    const result = await runChannelTurn({ userId: 'u-1', locale: 'en', text: 'hi' });
    expect(result.outcome).toBe('agent_unavailable');
    expect(result.replyText).toBe(CHANNEL_TURN_TEXTS.en.agent_unavailable);
  });
});

describe('runChannelTurn — outcome 分支', () => {
  beforeEach(baseSetup);

  it('agent 缺失 → agent_unavailable, 不查配额不进 LLM', async () => {
    getUserAgentId.mockResolvedValue(null);
    const result = await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    expect(result.outcome).toBe('agent_unavailable');
    expect(result.replyText).toBe(CHANNEL_TURN_TEXTS.zh.agent_unavailable);
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(processLettaResponse).not.toHaveBeenCalled();
  });

  it('daily 配额触顶 → limit_daily (中文文案含"明天再来")', async () => {
    checkRateLimit.mockImplementation((key: string) =>
      key.startsWith('chat:daily:')
        ? Promise.resolve({ allowed: false, remaining: 0 })
        : Promise.resolve({ allowed: true, remaining: 10 }),
    );
    const result = await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    expect(result.outcome).toBe('limit_daily');
    expect(result.replyText).toBe(CHANNEL_TURN_TEXTS.zh.limit_daily);
    expect(result.replyText).toContain('明天再来');
    expect(processLettaResponse).not.toHaveBeenCalled();
  });

  it('hourly 配额触顶 → limit_hourly', async () => {
    checkRateLimit.mockImplementation((key: string) =>
      key.startsWith('chat:user:')
        ? Promise.resolve({ allowed: false, remaining: 0 })
        : Promise.resolve({ allowed: true, remaining: 10 }),
    );
    const result = await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    expect(result.outcome).toBe('limit_hourly');
    expect(result.replyText).toBe(CHANNEL_TURN_TEXTS.zh.limit_hourly);
  });

  it('全局日预算耗尽 → limit_global, 不进 LLM (§8 兜底防线)', async () => {
    checkRateLimit.mockImplementation((key: string) =>
      key === 'channel:global:daily'
        ? Promise.resolve({ allowed: false, remaining: 0 })
        : Promise.resolve({ allowed: true, remaining: 10 }),
    );
    const result = await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    expect(result.outcome).toBe('limit_global');
    expect(result.replyText).toBe(CHANNEL_TURN_TEXTS.zh.limit_global);
    expect(result.replyText).toContain('明天再来');
    // 预算闸参数锁定: 共享键 + 24h 窗 + 默认预算 (config 未配 env → 2000)
    expect(checkRateLimit).toHaveBeenCalledWith('channel:global:daily', 2000, 24 * 60 * 60 * 1000);
    expect(loadLettaTurnContext).not.toHaveBeenCalled();
    expect(processLettaResponse).not.toHaveBeenCalled();
  });

  it('LLM 抛错 → error outcome (文案兜底, 不裸抛)', async () => {
    processLettaResponse.mockRejectedValue(new Error('letta 500'));
    const result = await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    expect(result.outcome).toBe('error');
    expect(result.replyText).toBe(CHANNEL_TURN_TEXTS.zh.error);
  });

  it('LLM 返回空 reply → error outcome (空消息不发)', async () => {
    processLettaResponse.mockResolvedValue({ reply: '', reasoning: undefined, toolCalls: [] });
    const result = await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    expect(result.outcome).toBe('error');
  });

  it('快照查询失败 (null) → fail-open 照常进 LLM (与 Web 同语义)', async () => {
    getChatProfileSnapshot.mockResolvedValue(null);
    const result = await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    expect(result.outcome).toBe('replied');
    const keys = checkRateLimit.mock.calls.map((c) => c[0]);
    expect(keys).toContain('chat:daily:u-1');
  });
});

describe('runChannelTurn — reasoning 铁律', () => {
  beforeEach(baseSetup);

  it('replyText 绝不含 reasoning 内容 (text-only 通道)', async () => {
    processLettaResponse.mockResolvedValue({
      reply: '买之前先睡一晚',
      reasoning: 'SECRET_CHAIN_OF_THOUGHT',
      toolCalls: [],
    });
    const result = await runChannelTurn({ userId: 'u-1', locale: 'zh', text: 'hi' });
    expect(result.replyText).toBe('买之前先睡一晚');
    expect(result.replyText).not.toContain('SECRET_CHAIN_OF_THOUGHT');
    // 返回对象整体序列化也不含 reasoning 字段/内容
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('SECRET_CHAIN_OF_THOUGHT');
    expect(serialized).not.toContain('reasoning');
  });
});

describe('CHANNEL_TURN_TEXTS — 双语文案快照', () => {
  it('全部 outcome × 双语齐全且非空', () => {
    for (const locale of ['zh', 'en'] as const) {
      const texts = CHANNEL_TURN_TEXTS[locale];
      expect(Object.keys(texts).sort()).toEqual(['agent_unavailable', 'error', 'limit_daily', 'limit_global', 'limit_hourly']);
      for (const key of Object.keys(texts)) {
        expect(texts[key as keyof typeof texts].length).toBeGreaterThan(0);
      }
    }
  });

  it('zh 文案是正式系统语言 (契约类文案铁律)', () => {
    expect(CHANNEL_TURN_TEXTS.zh.limit_daily).toContain('今日额度已用完');
    expect(CHANNEL_TURN_TEXTS.zh.limit_hourly).toContain('稍作休息');
  });
});
