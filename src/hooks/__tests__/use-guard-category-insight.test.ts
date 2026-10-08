// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { useGuardCategoryInsight } from '@/hooks/use-guard-category-insight';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
vi.mock('@/hooks/use-hourly-rate', () => ({ useHourlyRate: vi.fn(() => ({ hourlyRate: 20 })) }));

async function settle() {
  await act(async () => {});
}

describe('useGuardCategoryInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates category count and private impact fields', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      events: [
        { metadata: { category: 'food', amount: 30 }, createdAt: '2026-01-01T00:00:00' },
        { metadata: { category: 'food', amount: 10 }, createdAt: '2026-01-02T00:00:00' },
        { metadata: { category: 'clothing', amount: 100 }, createdAt: '2026-01-03T00:00:00' },
      ],
    });
    const { result } = renderHook(() => useGuardCategoryInsight());
    await settle();

    expect(result.current.insights).toEqual([
      { category: 'food', count: 2, estSaved: 40, hoursReclaimed: 2 },
      { category: 'clothing', count: 1, estSaved: 100, hoursReclaimed: 5 },
    ]);
  });

  it('puts other last and falls back to item title category', async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      events: [
        { metadata: null, createdAt: '2026-01-03T00:00:00' },
        { metadata: { itemTitle: 'Grocery', amount: 5 }, createdAt: '2026-01-02T00:00:00' },
        { metadata: { itemTitle: 'Shoes', amount: 30 }, createdAt: '2026-01-01T00:00:00' },
      ],
    });
    const { result } = renderHook(() => useGuardCategoryInsight());
    await settle();

    expect(result.current.insights.map((row) => [row.category, row.count])).toEqual([['clothing', 1], ['food', 1], ['other', 1]]);
  });

  it('continues pagination with before cursor for full pages', async () => {
    vi.mocked(apiFetch).mockImplementation((url: string) => {
      const before = new URL(url).searchParams.get('before');
      return before ? Promise.resolve({ events: [{ metadata: { category: 'food' }, createdAt: '2026-01-01T00:00:00' }] }) : Promise.resolve({
        events: [
          ...Array.from({ length: 100 }, (_, index) => ({ metadata: { category: 'food' }, createdAt: `2026-01-${String(100 - index).padStart(3, '0')}T00:00:00` })),
        ],
      });
    });
    const { result } = renderHook(() => useGuardCategoryInsight());
    await settle();

    expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain('before=2026-01-001');
    expect(result.current.insights).toEqual([{ category: 'food', count: 101, estSaved: 0, hoursReclaimed: 0 }]);
  });

  it('returns an empty list for zero events', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useGuardCategoryInsight());
    await settle();

    expect(result.current.insights).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('degrades to empty insights on fetch failure', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGuardCategoryInsight());
    await settle();

    expect(result.current).toEqual({ insights: [], isLoading: false });
  });
});
