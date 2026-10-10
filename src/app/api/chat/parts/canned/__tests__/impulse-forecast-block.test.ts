import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  detectQuery: vi.fn(() => true),
  detectDay: vi.fn((..._a: unknown[]): string | null => null),
  buildTurn: vi.fn(() => ({ reply: '预测回复', impulseForecastCard: { kind: 'forecast' } })),
  buildDayTurn: vi.fn(() => ({ reply: '周二回复', impulseForecastCard: { kind: 'forecast-day' } })),
  buildSse: vi.fn(() => 'sse-forecast'),
  loadEvents: vi.fn(() => Promise.resolve([{ eventType: 'impulse', createdAt: '2026-10-01' }])),
  loadGuardPulse: vi.fn(() => Promise.resolve({ events: [], timezone: 'Asia/Shanghai' })),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../impulse-forecast-detector', () => ({
  detectForecastQuery: M.detectQuery,
  detectForecastDayFollowUp: M.detectDay,
}));
vi.mock('../../impulse-forecast-turn', () => ({
  buildImpulseForecastTurn: M.buildTurn,
  buildImpulseForecastDayTurn: M.buildDayTurn,
  buildImpulseForecastSseStream: M.buildSse,
}));
vi.mock('../../impulse-forecast-context', () => ({
  loadImpulseForecastEvents: M.loadEvents,
}));
vi.mock('../../guard-pulse-context', () => ({
  loadGuardPulseQueryData: M.loadGuardPulse,
}));

import { tryImpulseForecastBlock } from '../impulse-forecast-block';

const baseInput = {
  userContent: '我什么时候最容易冲动',
  locale: 'zh' as const,
  stream: false,
  userId: 'u1',
  supabase: {},
  dataQueryContext: null,
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

/**
 * impulse-forecast-block.ts (79行) — 冲动预测数据问答短路 (time audit 件)。
 *
 * 锁定:
 * - 非预测问句+无追问 → null 未命中
 * - 主问 → buildTurn (events 装载+时区: 显式优先, 缺省走 guard-pulse 同源)
 * - 卡上溯 (kind=forecast) +非预测句 → 追问按日分桶 (buildDayTurn)
 * - stream → SSE
 */
describe('tryImpulseForecastBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.detectQuery.mockReturnValue(true);
    M.detectDay.mockReturnValue(null);
    M.buildTurn.mockReturnValue({ reply: '预测回复', impulseForecastCard: { kind: 'forecast' } });
  });

  it('非预测+无追问 → null', async () => {
    M.detectQuery.mockReturnValueOnce(false);
    expect(await tryImpulseForecastBlock(baseInput as never)).toBeNull();
  });

  it('主问 → buildTurn+events 装载+时区兜底 (guard-pulse 同源)', async () => {
    const r = await tryImpulseForecastBlock({ ...baseInput, timeZone: null } as never);
    expect(r).toBeInstanceOf(Response);
    const body = await (r as Response).json();
    expect(body.reply).toBe('预测回复');
    expect(body.impulseForecastCard.kind).toBe('forecast');
    expect(M.loadEvents).toHaveBeenCalledTimes(1);
    expect(M.loadGuardPulse).toHaveBeenCalledWith({ userId: 'u1', store: {} }); // 时区兜底读取
    expect(M.buildTurn).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'Asia/Shanghai' }));
  });

  it('显式 timeZone 优先 (不走 guard-pulse)', async () => {
    await tryImpulseForecastBlock({ ...baseInput, timeZone: 'America/New_York' } as never);
    expect(M.loadGuardPulse).not.toHaveBeenCalled();
    expect(M.buildTurn).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'America/New_York' }));
  });

  it('卡上溯追问 (kind=forecast+非预测句) → 按日分桶', async () => {
    M.detectQuery.mockReturnValueOnce(false);
    M.detectDay.mockReturnValueOnce('tuesday');
    const r = await tryImpulseForecastBlock({ ...baseInput, dataQueryContext: { kind: 'forecast' } } as never);
    const body = await (r as Response).json();
    expect(body.reply).toBe('周二回复');
    expect(M.buildDayTurn).toHaveBeenCalledWith(expect.objectContaining({ day: 'tuesday', timeZone: 'Asia/Shanghai' }));
  });

  it('stream → SSE 体', async () => {
    const r = await tryImpulseForecastBlock({ ...baseInput, stream: true } as never);
    expect(r?.headers.get('content-type')).toBe('text/event-stream');
    expect(await r?.text()).toBe('sse-forecast');
  });

  it('时区兜底读取失败 → 回退 null 分桶不炸', async () => {
    M.loadGuardPulse.mockRejectedValueOnce(new Error('db down'));
    const r = await tryImpulseForecastBlock({ ...baseInput, timeZone: null } as never);
    expect(r).toBeInstanceOf(Response);
    expect(M.buildTurn).toHaveBeenCalledWith(expect.objectContaining({ timeZone: null }));
  });
});
