import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  buildTurn: vi.fn((..._a: unknown[]): { reply: string; shoppingClarifyCard: unknown } | null => null),
  buildSse: vi.fn(() => 'sse-clarify'),
  answerToIntent: vi.fn((..._a: unknown[]): string | null => null),
  classify: vi.fn(() => ({ confidence: 'maybe' })),
}));

vi.mock('../../shopping-clarify-turn', () => ({
  buildShoppingClarifyTurn: M.buildTurn,
  buildShoppingClarifySseStream: M.buildSse,
  shoppingClarifyAnswerToIntent: M.answerToIntent,
}));
vi.mock('@/lib/shopping-intent-clarify', () => ({ classifyShoppingIntent: M.classify }));

import { tryShoppingClarifyBlock } from '../shopping-clarify-block';

const baseInput = {
  userContent: '在购物和存钱之间纠结',
  locale: 'zh' as const,
  stream: false,
  askedSubjects: [],
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

/**
 * shopping-clarify-block.ts (75行) — 快问卡澄清短路 (链序敏感件)。
 *
 * 锁定:
 * - 机器应答转译 → effectiveUserContent 直通 (零短路零 suppress)
 * - 追问命中 → 短路 (JSON/SSE), suppress=false
 * - 非追问+意图 not_purchase → suppressGuardCards=true (下游卡全静默)
 * - 判定器抛错 → 未命中兜底 (旗标 false 不阻断)
 */
describe('tryShoppingClarifyBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildTurn.mockReturnValue(null);
    M.answerToIntent.mockReturnValue(null);
    M.classify.mockReturnValue({ confidence: 'maybe' });
  });

  it('机器应答转译 → effectiveUserContent', async () => {
    M.answerToIntent.mockReturnValueOnce('我就是想比价');
    const r = await tryShoppingClarifyBlock(baseInput as never);
    expect(r).toEqual({ response: null, suppressGuardCards: false, effectiveUserContent: '我就是想比价' });
    expect(M.buildTurn).not.toHaveBeenCalled(); // 转译优先短路后续判定
  });

  it('追问命中 → JSON 短路+卡', async () => {
    M.buildTurn.mockReturnValueOnce({ reply: '想买给自己还是送人？', shoppingClarifyCard: { kind: 'clarify' } });
    const r = await tryShoppingClarifyBlock(baseInput as never);
    expect(r.response).toBeInstanceOf(Response);
    expect(r.suppressGuardCards).toBe(false);
    const body = await (r.response as Response).json();
    expect(body.shoppingClarifyCard.kind).toBe('clarify');
  });

  it('追问命中 → SSE 形态', async () => {
    M.buildTurn.mockReturnValueOnce({ reply: 'q', shoppingClarifyCard: {} });
    const r = await tryShoppingClarifyBlock({ ...baseInput, stream: true } as never);
    expect(r.response?.headers.get('content-type')).toBe('text/event-stream');
    expect(await r.response?.text()).toBe('sse-clarify');
  });

  it('非追问+not_purchase → suppressGuardCards=true', async () => {
    M.classify.mockReturnValueOnce({ confidence: 'not_purchase' });
    const r = await tryShoppingClarifyBlock(baseInput as never);
    expect(r).toEqual({ response: null, suppressGuardCards: true });
  });

  it('普通消息 → 全直通 (false+null)', async () => {
    const r = await tryShoppingClarifyBlock(baseInput as never);
    expect(r).toEqual({ response: null, suppressGuardCards: false });
    expect(M.classify).toHaveBeenCalledWith(expect.objectContaining({ message: '在购物和存钱之间纠结', locale: 'zh' }));
  });

  it('判定器抛错 → 未命中兜底 (绝不阻断对话)', async () => {
    M.answerToIntent.mockImplementationOnce(() => { throw new Error('detector boom'); });
    const r = await tryShoppingClarifyBlock(baseInput as never);
    expect(r).toEqual({ response: null, suppressGuardCards: false });
  });
});
