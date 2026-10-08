// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuardConsistencyMatrix } from '@/hooks/use-guard-consistency-matrix';

const apiFetchMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
vi.mock('@/lib/logger', () => ({ logger: { warn: loggerWarnMock } }));

type Event = {
  id: string;
  eventType: string;
  triggerSource: string | null;
  triggerId: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

const event = (id: string, eventType: string, createdAt: string, metadata: Record<string, unknown> | null = null): Event => ({
  id,
  eventType,
  triggerSource: null,
  triggerId: id,
  metadata,
  createdAt,
});

const mockEvents = (events: Event[]) =>
  apiFetchMock.mockImplementation((url: string) => {
    const type = new URL(url).searchParams.get('event_type');
    return { events: events.filter((item) => item.eventType === type) };
  });

async function settle() {
  await act(async () => {});
}

describe('useGuardConsistencyMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('构建多域矩阵并计算稳定度与私享金额', async () => {
    mockEvents([
      ...[1, 2].map((index) => event(`guard-e-${index}`, 'challenge_completed', `2026-01-0${index}T10:00:00`, { itemTitle: '耳机', savedAmount: 10 })),
      ...[1, 2, 3].map((index) => event(`guard-f-${index}`, 'challenge_completed', `2026-01-0${index}T11:00:00`, { itemTitle: '外套', savedAmount: 20 })),
      event('release-f', 'challenge_failed', '2026-01-03T12:00:00', { itemTitle: '大衣' }),
      event('reuse-1', 'mindful_recovery', '2026-01-04T10:00:00', { kind: 'reuse_adoption', categoryId: 'tool_rental', estSaved: 15 }),
    ]);
    const { result } = renderHook(() => useGuardConsistencyMatrix());
    expect(result.current.isLoading).toBe(true);
    await settle();

    expect(apiFetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.matrix).toMatchObject({
      status: 'ok',
      steadiestCategory: 'clothing',
      needsCareCategory: null,
      unclassified: 0,
      activeDays: 4,
      privateEstSavedByCategory: { electronics: 20, clothing: 60, tool_rental: 15 },
    });
    const clothing = result.current.matrix?.rows.find((row) => row.category === 'clothing');
    expect(clothing).toMatchObject({ guarded: 3, released: 1, activeDays: 3, stability: 0.75, status: 'ok' });
  });

  it('单域样本不足时不给稳定度结论', async () => {
    mockEvents([
      event('guard-1', 'challenge_completed', '2026-01-01T10:00:00', { itemTitle: '耳机', savedAmount: 10 }),
      event('guard-2', 'challenge_completed', '2026-01-02T10:00:00', { itemTitle: '耳机', savedAmount: 10 }),
    ]);
    const { result } = renderHook(() => useGuardConsistencyMatrix());
    await settle();

    expect(result.current.matrix).toMatchObject({
      status: 'insufficient',
      steadiestCategory: null,
      rows: [expect.objectContaining({ category: 'electronics', guarded: 2, stability: 0, status: 'insufficient' })],
    });
  });

  it('未归类事件计入 unclassified 且不造域行', async () => {
    mockEvents([event('unknown-1', 'challenge_completed', '2026-01-01T10:00:00', { itemTitle: '奇怪商品' })]);
    const { result } = renderHook(() => useGuardConsistencyMatrix());
    await settle();

    expect(result.current.matrix).toMatchObject({ status: 'insufficient', rows: [], unclassified: 1, activeDays: 1 });
  });

  it('空数据返回 empty 状态', async () => {
    apiFetchMock.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useGuardConsistencyMatrix());
    await settle();

    expect(result.current.matrix).toMatchObject({ status: 'empty', rows: [], unclassified: 0, activeDays: 0 });
  });

  it('请求失败静默降级为 null', async () => {
    apiFetchMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGuardConsistencyMatrix());
    await settle();

    expect(result.current).toMatchObject({ isLoading: false, matrix: null });
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
  });
});
