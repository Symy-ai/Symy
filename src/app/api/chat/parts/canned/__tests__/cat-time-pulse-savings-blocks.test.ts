import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  detectCategory: vi.fn(() => false),
  buildCategory: vi.fn(() => ({ reply: '奶茶拦了 3 次', categoryQueryCard: { kind: 'category' } })),
  categorySse: vi.fn(() => 'sse-cat'),
  detectTime: vi.fn(() => false),
  buildTime: vi.fn(() => ({ reply: '晚上冲动多', impulseTimeCard: { kind: 'time' } })),
  timeSse: vi.fn(() => 'sse-time'),
  detectPulse: vi.fn(() => false),
  buildPulse: vi.fn(() => ({ reply: '你的脆弱时段', guardPulseCard: { kind: 'pulse' } })),
  pulseSse: vi.fn(() => 'sse-pulse'),
  loadPulse: vi.fn((..._a: unknown[]): Promise<{ events: unknown[]; timezone: string | null }> => Promise.resolve({ events: [], timezone: 'Asia/Shanghai' })),
  detectSavings: vi.fn(() => false),
  buildSavings: vi.fn((..._a: unknown[]): { reply: string; savingsQueryCard: unknown } | null => ({ reply: '本月省了 300', savingsQueryCard: { kind: 'savings' } })),
  savingsSse: vi.fn(() => 'sse-sav'),
  loadEvents: vi.fn(() => Promise.resolve([])),
  hourlyRate: vi.fn(() => Promise.resolve(30)),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../category-query-detector', () => ({ detectCategoryQuery: M.detectCategory }));
vi.mock('../../category-query-turn', () => ({
  buildCategoryQueryTurn: M.buildCategory,
  buildCategoryQuerySseStream: M.categorySse,
}));
vi.mock('../../impulse-time-query-detector', () => ({ detectImpulseTimeQuery: M.detectTime }));
vi.mock('../../impulse-time-query-turn', () => ({
  buildImpulseTimeQueryTurn: M.buildTime,
  buildImpulseTimeSseStream: M.timeSse,
}));
vi.mock('../../guard-pulse-detector', () => ({ detectGuardPulseQuery: M.detectPulse }));
vi.mock('../../guard-pulse-turn', () => ({
  buildGuardPulseTurn: M.buildPulse,
  buildGuardPulseSseStream: M.pulseSse,
}));
vi.mock('../../guard-pulse-context', () => ({ loadGuardPulseQueryData: M.loadPulse }));
vi.mock('../../savings-query-detector', () => ({ detectSavingsQuery: M.detectSavings }));
vi.mock('../../savings-query-turn', () => ({
  buildSavingsQueryTurn: M.buildSavings,
  buildSavingsQuerySseStream: M.savingsSse,
}));
vi.mock('../../savings-query-context', () => ({ loadSavingsQueryEvents: M.loadEvents }));
vi.mock('@/lib/user-hourly-rate', () => ({ getUserHourlyRate: M.hourlyRate }));

import { tryCategoryQueryBlock } from '../category-query-block';
import { tryImpulseTimeQueryBlock } from '../impulse-time-block';
import { tryGuardPulseBlock } from '../guard-pulse-block';
import { trySavingsQueryBlock } from '../savings-query-block';

const baseInput = {
  userContent: '这个月省了多少',
  locale: 'zh' as const,
  stream: false,
  userId: 'u1',
  supabase: {},
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

/**
 * b137 拆解第一/二/三/五刀打包 (65+50+52+53=220行) — 数据问答四块 (canned 目录收官)。
 *
 * 锁定:
 * - category/time: 未命中 null; 命中 JSON 卡+SSE; events 装载
 * - pulse: loadGuardPulseQueryData 双载荷 (events+timezone) 透传 build
 * - savings: events+rate 并行+兜底 25; buildSavings 返回 null 时也 null
 */
describe('tryCategoryQueryBlock (分类问句)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.detectCategory.mockReturnValue(false);
  });

  it('未命中 → null (不装数据)', async () => {
    expect(await tryCategoryQueryBlock(baseInput as never)).toBeNull();
    expect(M.loadEvents).not.toHaveBeenCalled();
  });

  it('命中 → JSON+categoryQueryCard', async () => {
    M.detectCategory.mockReturnValueOnce(true);
    const r = await tryCategoryQueryBlock(baseInput as never);
    expect((await (r as Response).json()).categoryQueryCard.kind).toBe('category');
    expect(M.loadEvents).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
  });

  it('命中 → SSE', async () => {
    M.detectCategory.mockReturnValueOnce(true);
    expect(await (await tryCategoryQueryBlock({ ...baseInput, stream: true } as never))?.text()).toBe('sse-cat');
  });
});

describe('tryImpulseTimeQueryBlock (时段问句)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.detectTime.mockReturnValue(false);
  });

  it('未命中 → null', async () => {
    expect(await tryImpulseTimeQueryBlock(baseInput as never)).toBeNull();
  });

  it('命中 → JSON+impulseTimeCard', async () => {
    M.detectTime.mockReturnValueOnce(true);
    const r = await tryImpulseTimeQueryBlock(baseInput as never);
    expect((await (r as Response).json()).impulseTimeCard.kind).toBe('time');
  });

  it('命中 → SSE', async () => {
    M.detectTime.mockReturnValueOnce(true);
    expect(await (await tryImpulseTimeQueryBlock({ ...baseInput, stream: true } as never))?.text()).toBe('sse-time');
  });
});

describe('tryGuardPulseBlock (守护脉搏)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.detectPulse.mockReturnValue(false);
  });

  it('未命中 → null', async () => {
    expect(await tryGuardPulseBlock(baseInput as never)).toBeNull();
  });

  it('命中 → 双载荷 (events+timezone) 透传 build', async () => {
    M.detectPulse.mockReturnValueOnce(true);
    M.loadPulse.mockResolvedValueOnce({ events: [{ h: 22 }], timezone: 'Europe/Berlin' });
    const r = await tryGuardPulseBlock(baseInput as never);
    const body = await (r as Response).json();
    expect(body.guardPulseCard.kind).toBe('pulse');
    expect(M.buildPulse).toHaveBeenCalledWith(expect.objectContaining({ events: [{ h: 22 }], timezone: 'Europe/Berlin' }));
  });

  it('命中 → SSE', async () => {
    M.detectPulse.mockReturnValueOnce(true);
    expect(await (await tryGuardPulseBlock({ ...baseInput, stream: true } as never))?.text()).toBe('sse-pulse');
  });
});

describe('trySavingsQueryBlock (问账)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.detectSavings.mockReturnValue(false);
    M.buildSavings.mockReturnValue({ reply: '本月省了 300', savingsQueryCard: { kind: 'savings' } });
  });

  it('未命中 → null', async () => {
    expect(await trySavingsQueryBlock(baseInput as never)).toBeNull();
  });

  it('命中 → events+rate 并行+savingsQueryCard', async () => {
    M.detectSavings.mockReturnValueOnce(true);
    const r = await trySavingsQueryBlock(baseInput as never);
    const body = await (r as Response).json();
    expect(body.savingsQueryCard.kind).toBe('savings');
    expect(M.hourlyRate).toHaveBeenCalledWith('u1');
  });

  it('userId 缺失 → rate 兜底 25', async () => {
    M.detectSavings.mockReturnValueOnce(true);
    await trySavingsQueryBlock({ ...baseInput, userId: null } as never);
    expect(M.buildSavings).toHaveBeenCalledWith(expect.objectContaining({ hourlyRate: 25 }));
  });

  it('buildSavings 返回 null → null (detector 命中但 build 拒绝)', async () => {
    M.detectSavings.mockReturnValueOnce(true);
    M.buildSavings.mockReturnValueOnce(null);
    expect(await trySavingsQueryBlock(baseInput as never)).toBeNull();
  });

  it('命中 → SSE', async () => {
    M.detectSavings.mockReturnValueOnce(true);
    expect(await (await trySavingsQueryBlock({ ...baseInput, stream: true } as never))?.text()).toBe('sse-sav');
  });
});
