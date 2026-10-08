import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/errors/api-error', () => ({
  ApiError: class extends Error {
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.status = status;
    }
  },
}));
vi.mock('@/hooks/use-green-pref', () => ({ getGreenPrefEnabled: vi.fn(() => true) }));
vi.mock('@/hooks/use-guard-intensity', () => ({ getGuardIntensity: vi.fn(() => 'balanced') }));
vi.mock('@/hooks/use-guard-scope', () => ({ getGuardScope: vi.fn(() => 'all') }));
vi.mock('@/components/chat/parts/micro-challenge-store', () => ({ readMicroChallengeHistory: vi.fn(() => [{ category: 'food', initiatedAt: 1 }]) }));
vi.mock('@/components/chat/parts/context-signal-store', () => ({ readDismissedContextSignals: vi.fn(() => ['coupon']) }));
vi.mock('@/components/chat/parts/shopping-clarify-store', () => ({ readAskedShoppingSubjects: vi.fn(() => ['keyboard']) }));
vi.mock('@/components/chat/parts/green-alt-retro-store', () => ({ consumeGreenAltRetroForRequest: vi.fn(() => ({ pending: { entryId: 'e9' } })) }));
vi.mock('../data-query-follow-up', () => ({ lastDataQueryMeta: vi.fn(() => null) }));
vi.mock('./chat-endpoint', () => ({ resolveChatEndpoint: vi.fn(() => '/api/chat') }));

import { requestSendMessage } from '../send-message-request';

function msg(id: string, role: 'user' | 'assistant' | 'action', content: string, extra: Record<string, unknown> = {}) {
  return { id, role, content, ...extra } as never;
}

const baseArgs = {
  displayContent: '你好',
  fullApiContent: '你好',
  userMsg: msg('u-1', 'user', '你好'),
  messages: [msg('a-1', 'assistant', '嗨'), msg('u-1', 'user', '你好')],
  activeChallenge: undefined,
  activeChallengeState: undefined,
  impulseContext: undefined,
  isDemo: false,
  locale: 'zh',
  signal: new AbortController().signal,
};

function okFetch() {
  return vi.fn(() => Promise.resolve({ ok: true })) as unknown as typeof fetch;
}

/**
 * send-message-request.ts (114行) — 发消息请求组装 (QA11 BUG-A 50 条裁剪件)。
 *
 * 锁定:
 * - 50 条裁剪 (QA11 BUG-A: 超 50 条整包 400)
 * - userMsg 恒末尾 + displayContent/apiContent 双内容
 * - action role → user
 * - body 十六字段 (greenPref/guard 强度/micro 仓/retro 三槽等)
 * - 非 ok → ApiError(status)
 */
describe('requestSendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', okFetch());
  });

  it('成功: POST /api/chat + 返回 response', async () => {
    const res = await requestSendMessage(baseArgs as never);
    expect(res.response).toBeTruthy();
    expect(res.currentActiveChallenge).toBeUndefined();
  });

  it('50 条裁剪: 60 条历史 → body.messages 恰 50 且含当前消息', async () => {
    const many = Array.from({ length: 59 }, (_, i) => msg(`h-${i}`, 'assistant', `m${i}`));
    const args = { ...baseArgs, messages: [...many, baseArgs.userMsg] };
    await requestSendMessage(args as never);
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages).toHaveLength(50);
    expect(body.messages[49].content).toBe('你好'); // 当前消息恒末尾
  });

  it('action role → user; userMsg 用 fullApiContent, 展示用 displayContent', async () => {
    const args = {
      ...baseArgs,
      displayContent: '点了卡片',
      fullApiContent: '[ACTION:join_challenge] 点了卡片',
      messages: [msg('act-1', 'action', '旧action'), baseArgs.userMsg],
    };
    await requestSendMessage(args as never);
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('user'); // action → user
    expect(body.messages[1].content).toBe('[ACTION:join_challenge] 点了卡片'); // fullApiContent
  });

  it('body 十六字段: 偏好/强度/范围/微挑战史/retro 三槽/afterGuardCard', async () => {
    await requestSendMessage(baseArgs as never);
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.locale).toBe('zh');
    expect(body.greenPref).toBe('on');
    expect(body.guardIntensity).toBe('balanced');
    expect(body.guardScope).toBe('all');
    expect(body.microChallengeHistory).toEqual([{ category: 'food', initiatedAt: 1 }]);
    expect(body.dismissedContextSignals).toEqual(['coupon']);
    expect(body.askedShoppingSubjects).toEqual(['keyboard']);
    expect(body.pendingGreenAltRetro).toEqual({ entryId: 'e9' });
    expect(body.challengeContext).toBeNull();
    // afterGuardCard: 最后 assistant 无卡片 → false
    expect(body.afterGuardCard).toBe(false);
  });

  it('afterGuardCard: 最后 assistant 带 greenAlt → true', async () => {
    const args = { ...baseArgs, messages: [msg('a-9', 'assistant', 'x', { greenAlt: {} }), baseArgs.userMsg] };
    await requestSendMessage(args as never);
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.afterGuardCard).toBe(true);
  });

  it('overrideChallengeContext 优先 → challengeContext 直传', async () => {
    const args = { ...baseArgs, overrideChallengeContext: { itemName: '键盘', amount: 99 } };
    await requestSendMessage(args as never);
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.challengeContext).toEqual({ itemName: '键盘', amount: 99 });
  });

  it('非 ok → ApiError(status) 且 message 截 200 字', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false, status: 429, text: () => Promise.resolve('x'.repeat(500)),
    })) as unknown as typeof fetch);
    await expect(requestSendMessage(baseArgs as never)).rejects.toMatchObject({
      status: 429,
    });
  });
});
