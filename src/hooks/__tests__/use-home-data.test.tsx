// @vitest-environment happy-dom

import { render, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

import { useHomeData, type HealthEventLite } from '../use-home-data';
import type { EmailReceipt } from '@/lib/supabase';

const receipt = (id: string, amount: number): EmailReceipt => ({
  id, merchant: `Merchant ${id}`, amount, currency: 'USD',
  purchaseDate: '2026-10-01T00:00:00.000Z', status: 'actionable',
} as unknown as EmailReceipt);

const healthEvent = (id: string): HealthEventLite => ({
  id, eventType: 'challenge_completed', createdAt: '2026-10-01T00:00:00.000Z',
  description: 'Kept a challenge', metadata: {},
});

function renderHooked(userId?: string) {
  const seen: ReturnType<typeof useHomeData>[] = [];
  function Consumer({ id }: { id?: string }) {
    const value = useHomeData(id);
    seen.push(value);
    return <div data-testid="consumer" />;
  }
  return {
    ...render(<Consumer id={userId} />),
    seen,
    rerenderWith(id?: string) {
      this.rerender(<Consumer id={id} />);
    },
  };
}

describe('useHomeData aggregation', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('stays empty and idle when no user is present', async () => {
    const view = renderHooked();
    await waitFor(() => expect(view.seen.length).toBeGreaterThan(0));
    expect(view.seen.at(-1)).toEqual({ emailReceipts: [], healthEvents: [], isHomeDataLoading: true });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('merges actionable and refunded receipts beside health events', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (url.includes('status=actionable')) return { receipts: [receipt('a', 10)] };
      if (url.includes('status=refunded')) return { receipts: [receipt('r', 20)] };
      return { events: [healthEvent('h')] };
    });
    const view = renderHooked('u-1');
    await waitFor(() => expect(view.seen.at(-1)?.isHomeDataLoading).toBe(false));
    expect(view.seen.at(-1)?.emailReceipts.map((item) => item.id)).toEqual(['a', 'r']);
    expect(view.seen.at(-1)?.healthEvents).toEqual([healthEvent('h')]);
  });

  it('keeps successful slices when other home requests fail', async () => {
    apiFetchMock.mockImplementation(async (url: string) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (url.includes('status=refunded')) throw new Error('refunds down');
      if (url.includes('status=actionable')) return { receipts: [receipt('a', 10)] };
      return { events: [healthEvent('h')] };
    });
    const view = renderHooked('u-1');
    await waitFor(() => expect(view.seen.at(-1)?.isHomeDataLoading).toBe(false));
    expect(view.seen.at(-1)?.emailReceipts.map((item) => item.id)).toEqual(['a']);
    expect(view.seen.at(-1)?.healthEvents.map((item) => item.id)).toEqual(['h']);
  });

  it('returns empty completed data when all requests fail', async () => {
    apiFetchMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error('home down');
    });
    const view = renderHooked('u-1');
    await waitFor(() => expect(view.seen.at(-1)?.isHomeDataLoading).toBe(false));
    expect(view.seen.at(-1)?.emailReceipts).toEqual([]);
    expect(view.seen.at(-1)?.healthEvents).toEqual([]);
  });

  it('clears loaded data immediately when the user switches', async () => {
    // mock 必须按 URL 路由 (actionable/refunded/health 三路并发) — 否则 receipts 叠成 2 条
    apiFetchMock.mockImplementation(async (url: string) => {
      await Promise.resolve();
      if (url.includes('status=actionable')) return { receipts: [receipt('a', 10)] };
      if (url.includes('status=refunded')) return { receipts: [] };
      return { events: [healthEvent('h')] };
    });
    const first = renderHooked('u-1');
    await waitFor(() => expect(first.seen.some((value) => value.emailReceipts.length === 1)).toBe(true), { timeout: 3000 });
    first.unmount();
    window.localStorage.clear();
    vi.clearAllMocks();
    apiFetchMock.mockImplementation(async () => {
      await Promise.resolve();
      return { receipts: [], events: [] };
    });
    const second = renderHooked('u-2');
    await waitFor(() => expect(second.seen.some((value) => value.isHomeDataLoading === false)).toBe(true), { timeout: 3000 });
    expect(second.seen.at(-1)?.emailReceipts).toEqual([]);
    expect(second.seen.at(-1)?.healthEvents).toEqual([]);
  });
});
