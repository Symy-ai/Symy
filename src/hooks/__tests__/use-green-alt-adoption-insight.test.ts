// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api-client';
import { useGreenAltAdoptionInsight } from '@/hooks/use-green-alt-adoption-insight';
import type { GreenAltInsightEventInput } from '@/lib/green-alt-adoption-insight';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

function event(overrides: Partial<GreenAltInsightEventInput>): GreenAltInsightEventInput {
  return { createdAt: new Date().toISOString(), ...overrides };
}

function adoption(id: string, category: string): GreenAltInsightEventInput {
  return event({ eventType: 'mindful_recovery', metadata: { kind: 'green_alt_adoption', entryId: id, category } });
}

function rejection(id: string): GreenAltInsightEventInput {
  return event({ eventType: 'manual_adjustment', metadata: { source: 'green_alt_rejection', entryId: id, reason: 'not_now' } });
}

async function settle() {
  await act(async () => {});
}

describe('useGreenAltAdoptionInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches all three event streams and derives an insight', async () => {
    vi.mocked(apiFetch).mockImplementation((url: string) => {
      const type = new URL(url).searchParams.get('event_type');
      if (type === 'mindful_recovery') return Promise.resolve({ events: [adoption('a', 'food'), adoption('b', 'food'), adoption('e', 'home')] });
      if (type === 'manual_adjustment') return Promise.resolve({ events: [rejection('c'), rejection('d')] });
      return Promise.resolve({ events: [] });
    });
    const { result } = renderHook(() => useGreenAltAdoptionInsight());
    await settle();

    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(3);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.insight).toMatchObject({
      status: 'ok',
      totalSuggestions: 5,
      adoptions: 3,
      rejections: 2,
      adoptionRate: 60,
      topAdoptionCategories: [{ category: 'food', count: 2 }, { category: 'home', count: 1 }],
      topRejectionReasons: [{ reason: 'not_now', count: 2 }],
    });
  });

  it('continues pagination while full pages arrive', async () => {
    vi.mocked(apiFetch).mockImplementation((url: string) => {
      const before = new URL(url).searchParams.get('before');
      return before ? Promise.resolve({ events: [adoption('late', 'food')] }) : Promise.resolve({
        events: Array.from({ length: 100 }, (_, index) => adoption(`id-${index}`, 'food')),
      });
    });
    const { result } = renderHook(() => useGreenAltAdoptionInsight());
    await settle();

    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(6);
    expect(result.current.insight.observedAdoptions).toBeGreaterThanOrEqual(101);
  });

  it('returns the empty insight when all streams are empty', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useGreenAltAdoptionInsight());
    await settle();

    expect(result.current).toEqual({
      insight: {
        status: 'insufficient', totalSuggestions: 0, adoptions: 0, rejections: 0,
        adoptionRate: 0, activeDays: 0, topAdoptionCategories: [], topRejectionReasons: [],
        nonRepurchasesWithin7Days: 0, observedAdoptions: 0,
      },
      isLoading: false,
    });
  });

  it('stays empty but stops loading when one stream fails', async () => {
    vi.mocked(apiFetch).mockImplementation((url: string) => {
      if (new URL(url).searchParams.get('event_type') === 'challenge_failed') return Promise.reject(new Error('network down'));
      return Promise.resolve({ events: [] });
    });
    const { result } = renderHook(() => useGreenAltAdoptionInsight());
    await settle();

    expect(result.current.insight.status).toBe('insufficient');
    expect(result.current.isLoading).toBe(false);
  });
});
