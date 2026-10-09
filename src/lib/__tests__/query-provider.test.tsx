// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';

import { QueryProvider } from '../query-provider';

function ClientProbe() {
  const qc = useQueryClient();
  const defaults = qc.getDefaultOptions();
  return (
    <div data-testid="probe" data-stale={String(defaults.queries?.staleTime)} data-gc={String(defaults.queries?.gcTime)} data-focus={String(defaults.queries?.refetchOnWindowFocus)} data-retry={String(defaults.queries?.retry)} data-mretry={String(defaults.mutations?.retry)} />
  );
}

/**
 * query-provider.tsx (41行) — React Query 全局配置 (Round 95 迁移件)。
 *
 * 锁定 (P0-3 锚):
 * - staleTime 30s (Realtime 推送 → 短陈旧窗)
 * - gcTime 5min
 * - refetchOnWindowFocus=false (P0-3 修复: Realtime 已推, focus 不刷)
 * - queries retry=2 / mutations retry=0 (用户手动重试)
 */
describe('QueryProvider 全局配置', () => {
  afterEach(() => cleanup());

  it('默认五值锚 (stale/gc/focus/retry×2)', () => {
    render(
      <QueryProvider>
        <ClientProbe />
      </QueryProvider>,
    );
    const probe = screen.getByTestId('probe');
    expect(probe.getAttribute('data-stale')).toBe('30000');
    expect(probe.getAttribute('data-gc')).toBe('300000'); // 5min
    expect(probe.getAttribute('data-focus')).toBe('false'); // P0-3
    expect(probe.getAttribute('data-retry')).toBe('2');
    expect(probe.getAttribute('data-mretry')).toBe('0');
  });

  it('children 渲染透传', () => {
    render(
      <QueryProvider>
        <p>内容透传</p>
      </QueryProvider>,
    );
    expect(screen.getByText('内容透传')).toBeTruthy();
  });

  it('同挂载单 client (useState 工厂 — 重渲染不重建)', () => {
    const clients: unknown[] = [];
    function Collector() {
      clients.push(useQueryClient());
      return null;
    }
    const { rerender } = render(
      <QueryProvider>
        <Collector />
      </QueryProvider>,
    );
    rerender(
      <QueryProvider>
        <Collector />
      </QueryProvider>,
    );
    expect(clients[0]).toBe(clients[1]); // 同实例
  });
});
