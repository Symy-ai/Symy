import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  buildTurn: vi.fn(),
  buildSse: vi.fn(() => 'sse-body'),
  loadShoppingFacts: vi.fn(),
  loadEvidence: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../context-signal-turn', () => ({
  buildContextSignalTurn: M.buildTurn,
  buildContextSignalSseStream: M.buildSse,
}));
vi.mock('@/lib/shopping-facts', () => ({ loadShoppingFacts: M.loadShoppingFacts }));
vi.mock('../../context-trust-evidence', () => ({
  loadContextTrustEvidence: M.loadEvidence,
}));

import { tryContextSignalBlock } from '../context-signal-block';

const baseInput = {  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  userContent: '想奖励自己一下',
  locale: 'zh' as const,
  stream: false,
  userId: null,
  greenPref: 'on' as const,
  suppressGuardCards: false,
  dismissedContextSignals: [],
  guardIntensity: 'balanced',
  factsStore: null,
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

const makeTurn = (over: Partial<Record<string, unknown>> = {}) => ({
  reply: '我注意到…',
  contextSignal: { words: [{ id: 'reward_self', word: '奖励自己' }] },
  contextTrust: { history: [] },
  emotionGuardCard: undefined,
  cooldownCard: undefined,
  prepurchaseCard: undefined,
  ...over,
});

/**
 * context-signal-block.ts (91行) — 弱信号短路块 (batch61-b b137 第十七刀)。
 *
 * 锁定:
 * - greenPref off / suppressGuardCards → null (未命中继续链)
 * - 未命中 → null; 命中 → JSON (reply+contextSignal+条件三卡)
 * - stream → SSE 响应体
 * - 已纠正词条: 全命中 dismissed → contextTrust 撤销
 * - 登录+factsStore → facts 三条+evidence 装载 (失败 catch 降级)
 */
describe('tryContextSignalBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildTurn.mockReturnValue(makeTurn());
    M.loadShoppingFacts.mockResolvedValue({ facts: [{}, {}, {}, {}] }); // 4 条 — 期望裁 3
    M.loadEvidence.mockResolvedValue({ history: ['h1'], correction: null });
  });

  it('greenPref off / suppress → null', async () => {
    expect(await tryContextSignalBlock({ ...baseInput, greenPref: 'off' } as never)).toBeNull();
    expect(await tryContextSignalBlock({ ...baseInput, suppressGuardCards: true } as never)).toBeNull();
    expect(M.buildTurn).not.toHaveBeenCalled();
  });

  it('未命中 → null', async () => {
    M.buildTurn.mockReturnValueOnce(null);
    expect(await tryContextSignalBlock(baseInput as never)).toBeNull();
  });

  it('命中 → JSON: reply+contextSignal+可选三卡条件展开', async () => {
    const res = await tryContextSignalBlock(baseInput as never);
    expect(res).toBeInstanceOf(Response);
    const body = await (res as Response).json();
    expect(body.reply).toBe('我注意到…');
    expect(body.contextSignal.words[0].id).toBe('reward_self');
    expect(body.contextTrust).toBeTruthy();
    expect('emotionGuardCard' in body).toBe(false); // undefined 卡不进 body
    // 有卡时展开
    M.buildTurn.mockReturnValueOnce(makeTurn({ cooldownCard: { id: 'cd' } }));
    const res2 = await tryContextSignalBlock(baseInput as never);
    expect((await (res2 as Response).json()).cooldownCard).toEqual({ id: 'cd' });
  });

  it('stream → SSE 体+头', async () => {
    const res = await tryContextSignalBlock({ ...baseInput, stream: true } as never);
    expect(res).toBeInstanceOf(Response);
    expect(res?.headers.get('content-type')).toBe('text/event-stream');
    expect(await res?.text()).toBe('sse-body');
  });

  it('登录+factsStore → facts 裁 3+evidence; evidence 失败降级', async () => {
    M.loadEvidence.mockRejectedValueOnce(new Error('down'));
    const res = await tryContextSignalBlock({ ...baseInput, userId: 'u1', factsStore: {} } as never);
    expect(res).toBeInstanceOf(Response);
    expect(M.loadShoppingFacts).toHaveBeenCalledWith('u1', {});
    // facts 传给 buildTurn 的是前 3 条
    const callArgs = M.buildTurn.mock.calls[0][0];
    expect(callArgs.facts).toHaveLength(3);
    expect(callArgs.history).toEqual([]); // evidence 失败 → 空 history
    expect(callArgs.correction).toBeNull(); // catch 降级给 { correction: null } 非 undefined
  });

  it('已纠正词条全命中 dismissed → contextTrust 撤销', async () => {
    M.loadEvidence.mockResolvedValue({ history: [], correction: { topic: 'reward_self' } });
    M.buildTurn.mockReturnValueOnce(makeTurn({ contextTrust: { history: [] } }));
    const res = await tryContextSignalBlock({
      ...baseInput,
      userId: 'u1',
      factsStore: {},
      dismissedContextSignals: [],
    } as never);
    const body = await (res as Response).json();
    expect('contextTrust' in body).toBe(false); // 撤销
    expect(body.contextSignal).toBeTruthy(); // 信号本身保留
  });
});
