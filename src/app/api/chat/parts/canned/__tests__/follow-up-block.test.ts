import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  detect: vi.fn((..._a: unknown[]): unknown => null),
  resolve: vi.fn((..._a: unknown[]): unknown => null),
  buildTurn: vi.fn((..._a: unknown[]): { reply: string; savingsQueryCard?: unknown; categoryQueryCard?: unknown; impulseTimeCard?: unknown } | null => ({ reply: '追问回复' })),
  buildSse: vi.fn(() => 'sse-followup'),
  loadEvents: vi.fn(() => Promise.resolve([{ eventType: 'impulse' }])),
  hourlyRate: vi.fn(() => Promise.resolve(40)),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../follow-up-query', () => ({
  detectFollowUpQuery: M.detect,
  resolveFollowUpContext: M.resolve,
}));
vi.mock('../../follow-up-turn', () => ({
  buildFollowUpTurn: M.buildTurn,
  buildFollowUpSseStream: M.buildSse,
}));
vi.mock('../../savings-query-context', () => ({
  loadSavingsQueryEvents: M.loadEvents,
}));
vi.mock('@/lib/user-hourly-rate', () => ({ getUserHourlyRate: M.hourlyRate }));

import { tryFollowUpBlock } from '../follow-up-block';

const baseInput = {
  userContent: '那上个月呢',
  locale: 'zh' as const,
  stream: false,
  userId: 'u1',
  supabase: {},
  dataQueryContext: { kind: 'savings', range: 'month' },
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

/**
 * follow-up-block.ts (60行) — 追问跟随短路 (b137 拆解第十四刀)。
 *
 * 锁定:
 * - 非追问/无上文 (resolved null) → null (绝不拿空窗口算数)
 * - 命中 → events+hourlyRate 并行装载 → JSON 三卡条件展开
 * - userId 缺失 → hourlyRate 兜底 25
 * - stream → SSE
 */
describe('tryFollowUpBlock (追问跟随)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.detect.mockReturnValue(null);
    M.resolve.mockReturnValue(null);
    M.buildTurn.mockReturnValue({ reply: '追问回复' });
  });

  it('非追问 → null (不装数据)', async () => {
    expect(await tryFollowUpBlock(baseInput as never)).toBeNull();
    expect(M.loadEvents).not.toHaveBeenCalled();
  });

  it('追问但无上文 (dataQueryContext 缺失) → null', async () => {
    M.detect.mockReturnValueOnce({ kind: 'time-shift' });
    M.resolve.mockReturnValueOnce(null);
    expect(await tryFollowUpBlock({ ...baseInput, dataQueryContext: null } as never)).toBeNull();
    expect(M.resolve).toHaveBeenCalledWith(null, { kind: 'time-shift' });
  });

  it('命中 → events+rate 并行+三卡条件展开 (有 savings 卡才展开)', async () => {
    M.detect.mockReturnValueOnce({ kind: 'time-shift' });
    M.resolve.mockReturnValueOnce({ range: 'last-month' });
    M.buildTurn.mockReturnValueOnce({ reply: '上个月省了 200', savingsQueryCard: { kind: 'savings' } });
    const r = await tryFollowUpBlock(baseInput as never);
    const body = await (r as Response).json();
    expect(body.reply).toBe('上个月省了 200');
    expect(body.savingsQueryCard).toEqual({ kind: 'savings' });
    expect(body.categoryQueryCard).toBeUndefined(); // 未给的卡不展开
    expect(body.impulseTimeCard).toBeUndefined();
    expect(M.loadEvents).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
    expect(M.hourlyRate).toHaveBeenCalledWith('u1');
  });

  it('userId 缺失 → hourlyRate 兜底 25 (不调 getUserHourlyRate)', async () => {
    M.detect.mockReturnValueOnce({ kind: 'time-shift' });
    M.resolve.mockReturnValueOnce({ range: 'r' });
    await tryFollowUpBlock({ ...baseInput, userId: null } as never);
    expect(M.hourlyRate).not.toHaveBeenCalled();
    expect(M.buildTurn).toHaveBeenCalledWith(expect.objectContaining({ hourlyRate: 25 }));
  });

  it('getUserHourlyRate 抛错 → 兜底 25', async () => {
    M.detect.mockReturnValueOnce({ kind: 'time-shift' });
    M.resolve.mockReturnValueOnce({ range: 'r' });
    M.hourlyRate.mockRejectedValueOnce(new Error('db'));
    await tryFollowUpBlock(baseInput as never);
    expect(M.buildTurn).toHaveBeenCalledWith(expect.objectContaining({ hourlyRate: 25 }));
  });

  it('stream → SSE 形态', async () => {
    M.detect.mockReturnValueOnce({ kind: 'time-shift' });
    M.resolve.mockReturnValueOnce({ range: 'r' });
    const r = await tryFollowUpBlock({ ...baseInput, stream: true } as never);
    expect(await r?.text()).toBe('sse-followup');
  });
});
