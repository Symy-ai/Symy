import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/components/chat-bubble';

vi.mock('@/components/chat/parts/green-alt-retro-store', () => ({
  markGreenAltRetroAwaited: vi.fn(),
}));
vi.mock('@/lib/product-tool-result', () => ({
  extractProductCards: vi.fn((name: string, result: string) =>
    name === 'search_products' && result ? [{ id: 'p1', title: 'X' }] : []),
}));
vi.mock('@/lib/chat-drift-guard', () => ({
  applyDriftGuard: vi.fn(() => null),
  DRIFT_REPLACEMENTS: {},
}));

import { processSendMessageNonStream } from '../send-message-non-stream';

function makeArgs(overrides: Record<string, unknown> = {}) {
  const saved: ChatMessage[] = [];
  let messages: ChatMessage[] = [];
  const notifs: Array<[string, string]> = [];
  return {
    args: {
      response: { json: () => Promise.resolve({}) } as never,
      content: 'hello',
      msgMode: 'normal' as const,
      currentActiveChallenge: undefined,
      t: (key: string, opts?: Record<string, unknown>) => `${key}${opts ? JSON.stringify(opts) : ''}`,
      nextId: (prefix: string) => `${prefix}-1`,
      saveMessage: (m: ChatMessage) => saved.push(m),
      setMessagesSync: (u: ChatMessage[] | ((p: ChatMessage[]) => ChatMessage[])) => {
        messages = typeof u === 'function' ? u(messages) : u;
      },
      handleMCPResults: vi.fn(),
      addMcpNotification: (message: string, type: string) => notifs.push([message, type]),
      activeChallengeRef: { current: undefined },
      buddyStateRefreshTimerRef: { current: null },
      justCompletedChallengeRef: { current: false },
      justBoughtChallengeRef: { current: false },
      setActiveChallenge: vi.fn(),
      onBuddyStateRefresh: undefined,
      ...overrides,
    } as never,
    saved,
    notifs,
    getMessages: () => messages,
  };
}

describe('processSendMessageNonStream (234行非流式响应处理)', () => {
  it('基础: assistant 消息入列+保存+返回 id', async () => {
    const { args, saved, getMessages } = makeArgs({ response: { json: () => Promise.resolve({ reply: '你好' }) } as never });
    const id = await processSendMessageNonStream(args);
    expect(id).toBe('ai-1');
    const msg = saved[0];
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('你好');
    expect(getMessages()).toHaveLength(1);
  });

  it('空 reply: fallback 文案', async () => {
    const { args, saved } = makeArgs({ response: { json: () => Promise.resolve({}) } as never });
    await processSendMessageNonStream(args);
    expect(saved[0].content).toBe('chat.aiFallback.hereForYou');
  });

  it('search_products toolCall → productCards 透传 + query=content', async () => {
    const { args, saved } = makeArgs({
      response: { json: () => Promise.resolve({ reply: 'r', toolCalls: [{ name: 'search_products', result: 'json-here' }] }) } as never,
    });
    await processSendMessageNonStream(args);
    expect(saved[0].productCards).toHaveLength(1);
    expect(saved[0].productCardsQuery).toBe('hello');
  });

  it('15+ 卡片字段条件透传 (greenAlt/cooldownCard/compareCard 等)', async () => {
    const payload = {
      reply: 'r',
      greenAlt: { id: 'ga' }, reuseHint: { id: 'rh' }, microChallenge: { id: 'mc' },
      greenKnowledge: { id: 'gk' }, cooldownCard: { id: 'cc' }, prepurchaseCard: { id: 'pc' },
      duplicatePrecheckCard: { id: 'dp' }, commitmentCard: { id: 'cm' }, compareCard: { id: 'cp' },
      altFootprint: { id: 'af' }, listTriageCard: { id: 'lt' }, savingsQueryCard: { id: 'sq' },
      categoryQueryCard: { id: 'cq' }, impulseTimeCard: { id: 'it' }, impulseForecastCard: { id: 'if' },
      guardPulseCard: { id: 'gp' }, emotionGuardCard: { id: 'eg' },
    };
    const { args, saved } = makeArgs({ response: { json: () => Promise.resolve(payload) } as never });
    await processSendMessageNonStream(args);
    const m = saved[0] as unknown as Record<string, unknown>;
    for (const key of Object.keys(payload).filter(k => k !== 'reply')) {
      expect(m[key]).toBeTruthy();
    }
  });

  it('microChallenge 有活跃挑战时不覆盖 (与流式同语义)', async () => {
    const { args, saved } = makeArgs({
      response: { json: () => Promise.resolve({ reply: 'r', microChallenge: { id: 'mc' } }) } as never,
      currentActiveChallenge: { id: 'ch-active' },
    });
    await processSendMessageNonStream(args);
    expect((saved[0] as unknown as Record<string, unknown>).microChallenge).toBeUndefined();
  });

  it('greenAltRetro: markGreenAltRetroAwaited 调用', async () => {
    const { markGreenAltRetroAwaited } = await import('@/components/chat/parts/green-alt-retro-store');
    const { args, saved } = makeArgs({
      response: { json: () => Promise.resolve({ reply: 'r', greenAltRetro: { entryId: 'e-9' } }) } as never,
    });
    await processSendMessageNonStream(args);
    expect(markGreenAltRetroAwaited).toHaveBeenCalledWith('e-9');
    expect((saved[0] as unknown as Record<string, unknown>).greenAltRetro).toEqual({ entryId: 'e-9' });
  });

  it('toolResults 数组 → handleMCPResults', async () => {
    const handleMCPResults = vi.fn();
    const resp = { json: () => Promise.resolve({ reply: 'r', toolResults: [{ name: 'x' }] }) };
    const { args } = makeArgs({ response: resp as never, handleMCPResults });
    await processSendMessageNonStream(args);
    expect(handleMCPResults).toHaveBeenCalledWith([{ name: 'x' }]);
  });

  it('六工具通知: impulse=penalty/badge=badge/其余=reward + 金额文案', async () => {
    const { args, notifs } = makeArgs({
      response: {
        json: () => Promise.resolve({
          reply: 'r',
          toolCalls: [
            { name: 'record_impulse', args: { amount: 88 } },
            { name: 'add_badge', args: { badge_id: 'impulse_shield' } },
            { name: 'add_tokens', args: { amount: 5 } },
            { name: 'add_vitality', args: { amount: -3 } },
            { name: 'complete_challenge', args: {} },
            { name: 'unknown_tool', args: {} },
          ],
        }),
      },
    } as never);
    await processSendMessageNonStream(args);
    expect(notifs).toHaveLength(6);
    expect(notifs[0][1]).toBe('penalty');
    expect(notifs[0][0]).toContain('88');
    expect(notifs[1][1]).toBe('badge');
    expect(notifs[1][0]).toContain('impulse_shield');
    expect(notifs[2][0]).toContain('5');
    expect(notifs[3][0]).toContain('-3'); // vitality 负数带符号
    expect(notifs[4][0]).toContain('challengeCompleted'); // 无 saved_amount 走无金额文案
    expect(notifs[5][0]).toContain('unknown_tool'); // default toolUsed
  });

  it('complete_challenge 非买路径: onChallengeCompleted(挑战id, 存款额)', async () => {
    const onCompleted = vi.fn();
    const { args } = makeArgs({
      response: { json: () => Promise.resolve({ reply: 'r', toolCalls: [{ name: 'complete_challenge', args: { challenge_id: 'ch-1' } }] }) } as never,
      activeChallengeRef: { current: { id: 'ch-1', amount: 120, itemName: '鞋' } },
      onChallengeCompleted: onCompleted,
    });
    await processSendMessageNonStream(args);
    expect(onCompleted).toHaveBeenCalledWith('ch-1', 120);
  });

  it('complete_challenge 买路径: onChallengeBought(金额, 品名)', async () => {
    const onBought = vi.fn();
    const { args } = makeArgs({
      response: { json: () => Promise.resolve({ reply: 'r', toolCalls: [{ name: 'complete_challenge', args: {} }] }) } as never,
      activeChallengeRef: { current: { id: 'c', amount: 66, itemName: '游戏机' } },
      justBoughtChallengeRef: { current: true },
      onChallengeBought: onBought,
    });
    await processSendMessageNonStream(args);
    expect(onBought).toHaveBeenCalledWith(66, '游戏机');
  });

  it('onBuddyStateRefresh: 3s debounce (3000ms fake timers)', async () => {
    vi.useFakeTimers();
    try {
      const refresh = vi.fn();
      const { args } = makeArgs({
        response: { json: () => Promise.resolve({ reply: 'r', toolCalls: [{ name: 'add_tokens', args: {} }] }) },
        onBuddyStateRefresh: refresh,
      } as never);
      await processSendMessageNonStream(args);
      expect(refresh).not.toHaveBeenCalled(); // 3s 内未触发
      vi.advanceTimersByTime(3100);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
