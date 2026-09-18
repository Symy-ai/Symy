/**
 * useCommunityStats — strategies 真数据接线 + 降级矩阵 (batch81-b)
 *
 * 矩阵: API 成功透传 (source real/sample) / API 空数据 → mock+sample /
 * API 失败 → mock+sample / Demo 模式不发请求恒 mock。
 */

// @vitest-environment happy-dom

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useCommunityStats } from '../hooks/use-community-stats';

vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));

const mockedApiFetch = vi.mocked(apiFetch);

const REAL_STRATEGY = {
  strategy: 'scarcity',
  labelKey: 'defense.strategyScarcity',
  defaultLabel: '"Only 3 left" scarcity',
  percentage: 62.5,
};

function mockApi(handlers: Partial<Record<string, () => unknown>>) {
  mockedApiFetch.mockImplementation((url: string) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`unexpected fetch: ${url}`);
    return Promise.resolve(handler() as never);
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderStats(isDemo = false) {
  return renderHook(() => useCommunityStats(isDemo), { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useCommunityStats — strategies 数据源', () => {
  it('passes through real API data with its source marker', async () => {
    mockApi({
      '/api/community/stats': () => ({ activeUsers: 10, totalSaved: 1, totalChallengesPassed: 1, lifeHoursRecovered: 0.1, hasData: true }),
      '/api/community/platform-index': () => ({ platforms: [], hasData: false }),
      '/api/community/inducement-strategies': () => ({ strategies: [REAL_STRATEGY], source: 'real', totalEvents: 40 }),
    });

    const { result } = renderStats();

    await waitFor(() => expect(result.current.strategiesLoading).toBe(false), { timeout: 5000 });

    expect(result.current.strategies).toEqual([REAL_STRATEGY]);
    expect(result.current.strategiesSource).toBe('real');
  });

  it('falls back to mock strategies marked sample when the API returns empty data', async () => {
    mockApi({
      '/api/community/stats': () => ({ activeUsers: 0, totalSaved: 0, totalChallengesPassed: 0, lifeHoursRecovered: 0, hasData: false }),
      '/api/community/platform-index': () => ({ platforms: [], hasData: false }),
      '/api/community/inducement-strategies': () => ({ strategies: [], source: 'sample', totalEvents: 0 }),
    });

    const { result } = renderStats();

    await waitFor(() => expect(result.current.strategiesLoading).toBe(false), { timeout: 5000 });

    expect(result.current.strategies).toHaveLength(10);
    expect(result.current.strategiesSource).toBe('sample');
    // mock 降级保持 percentage 降序 (P1-3 口径)
    const percentages = result.current.strategies.map((s) => s.percentage);
    expect([...percentages].sort((a, b) => b - a)).toEqual(percentages);
  });

  it('falls back to mock strategies marked sample when the API request fails', async () => {
    mockApi({
      '/api/community/stats': () => ({ activeUsers: 0, totalSaved: 0, totalChallengesPassed: 0, lifeHoursRecovered: 0, hasData: false }),
      '/api/community/platform-index': () => ({ platforms: [], hasData: false }),
      '/api/community/inducement-strategies': () => { throw new Error('network down'); },
    });

    const { result } = renderStats();

    // retry:1 + 默认重试间隔 → 等 queries 落定 (loading false 且 strategies 已有降级值)
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.strategies).toHaveLength(10);
    }, { timeout: 8000 });

    expect(result.current.strategiesSource).toBe('sample');
  }, 10000);

  it('serves mock sample data without fetching in demo mode', () => {
    const { result } = renderStats(true);

    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(result.current.strategies).toHaveLength(10);
    expect(result.current.strategiesSource).toBe('sample');
    expect(result.current.strategiesLoading).toBe(false);
  });
});
