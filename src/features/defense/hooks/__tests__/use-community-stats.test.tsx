// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
}));

import { useCommunityStats } from '../use-community-stats';
import { apiFetch } from '@/lib/api-client';

const mockApi = vi.mocked(apiFetch);

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const realStats = { activeUsers: 10, totalSaved: 500, totalChallengesPassed: 3, lifeHoursRecovered: 25, hasData: true };
const realPlatforms = { platforms: [{ platform: 'x', label: 'X', icon: '✖️', index: 50, failedCount: 1, passedCount: 2, totalSaved: 100 }], hasData: true };
const realStrategies = {
  strategies: [{ strategy: 'scarcity', labelKey: 'defense.strategyScarcity', defaultLabel: '"Only 3 left"', percentage: 22 }],
  source: 'real',
  totalEvents: 300,
};

/**
 * use-community-stats.ts (181行) — Round 98 React Query 化的群体防御 hook。
 *
 * 锁定:
 * - demo: 零 fetch + DEMO_STATS/DEMO_PLATFORM_INDEX + FALLBACK strategies
 * - 三查询独立 (stats/platform/strategies 各自 queryKey)
 * - 降级矩阵: 空 strategies → mock+sample 保留服务端 source
 * - Round 117 P1-K-2: FALLBACK 十战术 (债务诱导 7 条入池)
 */
describe('useCommunityStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('demo: 零 fetch + DEMO_STATS 四数字 + isLoading=false', () => {
    const { result } = renderHook(() => useCommunityStats(true), { wrapper });
    expect(mockApi).not.toHaveBeenCalled();
    expect(result.current.stats).toEqual({
      activeUsers: 1247, totalSaved: 48392, totalChallengesPassed: 3891, lifeHoursRecovered: 2419.6, hasData: true,
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.strategiesSource).toBe('sample');
    expect(result.current.strategies.length).toBe(10);
  });

  it('非 demo: 三 API 各自拉取 (三个端点)', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url === '/api/community/stats') return Promise.resolve(realStats);
      if (url === '/api/community/platform-index') return Promise.resolve(realPlatforms);
      if (url === '/api/community/inducement-strategies') return Promise.resolve(realStrategies);
      return Promise.reject(new Error('unexpected ' + url));
    });
    const { result } = renderHook(() => useCommunityStats(false), { wrapper });
    await waitFor(() => expect(result.current.stats.activeUsers).toBe(10));
    expect(result.current.platformIndex).toHaveLength(1);
    expect(result.current.platformIndex[0].platform).toBe('x');
    expect(result.current.strategies).toEqual(realStrategies.strategies);
    expect(result.current.strategiesSource).toBe('real');
    const urls = mockApi.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/api/community/stats');
    expect(urls).toContain('/api/community/platform-index');
    expect(urls).toContain('/api/community/inducement-strategies');
  });

  it('降级矩阵: 服务端空 strategies (0 条) → FALLBACK 十条 + 保留 source', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url === '/api/community/stats') return Promise.resolve(realStats);
      if (url === '/api/community/platform-index') return Promise.resolve(realPlatforms);
      if (url === '/api/community/inducement-strategies') return Promise.resolve({ strategies: [], source: 'real', totalEvents: 0 });
      return Promise.reject(new Error('unexpected ' + url));
    });
    const { result } = renderHook(() => useCommunityStats(false), { wrapper });
    await waitFor(() => expect(mockApi.mock.calls.length).toBeGreaterThanOrEqual(3));
    await waitFor(() => expect(result.current.stats.activeUsers).toBe(10)); // 查询已 resolve
    expect(result.current.strategies.length).toBe(10); // 空数据 → FALLBACK
    expect(result.current.strategiesSource).toBe('real'); // 空数据但 source 保留服务端口径
  });

  it('降级矩阵: strategies API 挂 → FALLBACK + sample', async () => {
    mockApi.mockImplementation((url: string) => {
      if (url === '/api/community/stats') return Promise.resolve(realStats);
      if (url === '/api/community/platform-index') return Promise.resolve(realPlatforms);
      return Promise.reject(new Error('strategies down'));
    });
    const { result } = renderHook(() => useCommunityStats(false), { wrapper });
    await waitFor(() => expect(result.current.strategies.length).toBe(10));
    expect(result.current.strategiesSource).toBe('sample');
  });

  it('FALLBACK 十战术按 percentage 降序 (P1-3 口径) — 首条 limited_time (18)', () => {
    const { result } = renderHook(() => useCommunityStats(true), { wrapper });
    const pcts = result.current.strategies.map((s) => s.percentage);
    expect(pcts).toEqual([...pcts].sort((a, b) => b - a));
    expect(result.current.strategies[0].strategy).toBe('limited_time');
    expect(result.current.strategies[0].percentage).toBe(18);
  });

  it('Round 117 P1-K-2: 债务诱导 7 条在池 (bnpl/minimum_payment/payday_loan 等)', () => {
    const { result } = renderHook(() => useCommunityStats(true), { wrapper });
    const ids = result.current.strategies.map((s) => s.strategy);
    for (const debt of ['bnpl', 'minimum_payment', 'credit_limit_increase', 'zero_apr_intro', 'cash_advance', 'payday_loan', 'subprime_credit_card']) {
      expect(ids).toContain(debt);
    }
    // 债务诱导合计 57% > 营销诱导 43%
    const debtPct = result.current.strategies.filter((s) => ['bnpl', 'minimum_payment', 'credit_limit_increase', 'zero_apr_intro', 'cash_advance', 'payday_loan', 'subprime_credit_card'].includes(s.strategy)).reduce((a, b) => a + b.percentage, 0);
    expect(debtPct).toBe(57);
  });

  it('stats API 挂 → DEFAULT_STATS 零值兜底 (不阻塞 UI)', async () => {
    mockApi.mockImplementation(() => Promise.reject(new Error('down')));
    const { result } = renderHook(() => useCommunityStats(false), { wrapper });
    await waitFor(() => expect(mockApi).toHaveBeenCalled());
    expect(result.current.stats).toEqual({
      activeUsers: 0, totalSaved: 0, totalChallengesPassed: 0, lifeHoursRecovered: 0, hasData: false,
    });
  });

  it('platform API 挂 → 空数组兜底', async () => {
    mockApi.mockImplementation(() => Promise.reject(new Error('down')));
    const { result } = renderHook(() => useCommunityStats(false), { wrapper });
    await waitFor(() => expect(mockApi).toHaveBeenCalled());
    expect(result.current.platformIndex).toEqual([]);
  });

  it('refresh 是 no-op 函数 (Round 100 注释口径 — React Query 自管)', () => {
    const { result } = renderHook(() => useCommunityStats(true), { wrapper });
    expect(typeof result.current.refresh).toBe('function');
    expect(() => result.current.refresh()).not.toThrow();
  });
});
