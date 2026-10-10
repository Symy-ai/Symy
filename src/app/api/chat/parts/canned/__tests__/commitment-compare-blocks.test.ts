import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  buildCommitment: vi.fn((..._a: unknown[]): { reply: string; commitmentCard: unknown } | null => null),
  commitmentSse: vi.fn(() => 'sse-commitment'),
  buildCompare: vi.fn((..._a: unknown[]): { reply: string; compareCard: unknown } | null => null),
  compareSse: vi.fn(() => 'sse-compare'),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../commitment-turn', () => ({
  buildCommitmentTurn: M.buildCommitment,
  buildCommitmentSseStream: M.commitmentSse,
}));
vi.mock('../../compare-turn', () => ({
  buildCompareTurn: M.buildCompare,
  buildCompareSseStream: M.compareSse,
}));

import { tryCommitmentBlock } from '../commitment-block';
import { tryCompareBlock } from '../compare-block';

const baseInput = {
  userContent: '这个月不买咖啡',
  locale: 'zh' as const,
  stream: false,
  mergeCookies: (r: unknown) => r,
  mergeCookiesOnResponse: (r: unknown) => r,
  SSE_HEADERS: { 'content-type': 'text/event-stream' },
} as Record<string, unknown>;

/**
 * commitment-block (43行) + compare-block (43行) — b137 拆解第九/十刀 (链序不变件)。
 *
 * 锁定 (两块同构):
 * - 未命中 → null (route 续链)
 * - 命中 → JSON 短路 (卡字段名各异: commitmentCard / compareCard)
 * - 命中 → SSE 形态
 */
describe('tryCommitmentBlock (绿色承诺)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildCommitment.mockReturnValue(null);
  });

  it('未命中 → null', async () => {
    expect(await tryCommitmentBlock(baseInput as never)).toBeNull();
  });

  it('命中 → JSON 短路+commitmentCard', async () => {
    M.buildCommitment.mockReturnValueOnce({ reply: '承诺收到', commitmentCard: { kind: 'commitment' } });
    const r = await tryCommitmentBlock(baseInput as never);
    expect(r).toBeInstanceOf(Response);
    const body = await (r as Response).json();
    expect(body.reply).toBe('承诺收到');
    expect(body.commitmentCard.kind).toBe('commitment');
  });

  it('命中 → SSE 形态', async () => {
    M.buildCommitment.mockReturnValueOnce({ reply: 'r', commitmentCard: {} });
    const r = await tryCommitmentBlock({ ...baseInput, stream: true } as never);
    expect(r?.headers.get('content-type')).toBe('text/event-stream');
    expect(await r?.text()).toBe('sse-commitment');
  });
});

describe('tryCompareBlock (对比裁决)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.buildCompare.mockReturnValue(null);
  });

  it('未命中 → null', async () => {
    expect(await tryCompareBlock(baseInput as never)).toBeNull();
  });

  it('命中 → JSON 短路+compareCard', async () => {
    M.buildCompare.mockReturnValueOnce({ reply: '三行裁决', compareCard: { kind: 'compare' } });
    const r = await tryCompareBlock(baseInput as never);
    expect(r).toBeInstanceOf(Response);
    const body = await (r as Response).json();
    expect(body.compareCard.kind).toBe('compare');
  });

  it('命中 → SSE 形态', async () => {
    M.buildCompare.mockReturnValueOnce({ reply: 'r', compareCard: {} });
    const r = await tryCompareBlock({ ...baseInput, stream: true } as never);
    expect(r?.headers.get('content-type')).toBe('text/event-stream');
    expect(await r?.text()).toBe('sse-compare');
  });
});
