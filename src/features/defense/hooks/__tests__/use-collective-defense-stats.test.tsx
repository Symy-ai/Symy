// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));
const isCollectiveMock = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/platform-aggregate', () => ({ isCollectiveStats: isCollectiveMock }));

import { useCollectiveDefenseStats } from '../use-collective-defense-stats';

type Ret = ReturnType<typeof useCollectiveDefenseStats>;
const box: { current: Ret | null } = { current: null };
function Probe({ isDemo }: { isDemo: boolean }) {
  box.current = useCollectiveDefenseStats(isDemo);
  return null;
}

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const validStats = { hours: 1234.5, guards: 5678 };

/**
 * use-collective-defense-stats.ts (24行) — 集体守护统计 (react-query)。
 *
 * 锁定:
 * - isDemo → 不请求 (enabled 门), null+不 loading
 * - 有效数据 → 返回; 坏数据 → 抛错 (类型守卫)
 */
describe('useCollectiveDefenseStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    box.current = null;
  });
  afterEach(() => cleanup());

  it('isDemo → 不请求, null 且不 loading', () => {
    renderWithClient(<Probe isDemo />);
    expect(apiFetchMock).not.toHaveBeenCalled(); // enabled=false
    expect(box.current).toEqual({ collectiveStats: null, isLoading: false });
  });

  it('登录态: 有效数据返回 (isCollectiveStats 守卫通过)', async () => {
    apiFetchMock.mockResolvedValueOnce(validStats);
    isCollectiveMock.mockReturnValueOnce(true);
    renderWithClient(<Probe isDemo={false} />);
    await vi.waitFor(() => expect(box.current?.collectiveStats).toEqual(validStats));
    expect(apiFetchMock).toHaveBeenCalledWith('/api/defense/collective');
    expect(box.current?.isLoading).toBe(false);
  });

  it('坏数据 → 类型守卫抛错 (返回 null 不 crash)', async () => {
    apiFetchMock.mockResolvedValueOnce({ bogus: true });
    isCollectiveMock.mockReturnValueOnce(false);
    renderWithClient(<Probe isDemo={false} />);
    await vi.waitFor(() => expect(box.current?.collectiveStats).toBeNull()); // 错误态 data 无
    expect(isCollectiveMock).toHaveBeenCalledWith({ bogus: true });
  });
});
