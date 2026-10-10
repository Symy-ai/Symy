// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  adminGet: vi.fn(),
}));

vi.mock('@/lib/admin-panel/api-client', () => ({ adminGet: M.adminGet }));
vi.mock('next/link', () => ({ default: (props: { href: string; children: React.ReactNode }) => <a href={props.href}>{props.children}</a> }));
vi.mock('@/components/ui/card', () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock('@/components/ui/button', () => ({ Button: (p: { children: React.ReactNode; onClick?: () => void }) => <button onClick={p.onClick}>{p.children}</button> }));
vi.mock('@/components/ui/badge', () => ({ Badge: (p: { children: React.ReactNode }) => <span>{p.children}</span> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/ui/alert', () => ({
  Alert: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  AlertDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

import AdminDashboardPage from '../page';

function okAll(overrides: Record<string, unknown> = {}) {
  return {
    '/api/admin/letta': { ok: true, data: { health: 'ok', agents: 3 } },
    '/api/admin/agent-pool': { ok: true, data: { size: 5 } },
    '/api/admin/audit?action=stats': { ok: true, data: { total: 42 } },
    '/api/admin/audit?page=1&limit=5': { ok: true, data: { logs: [{ id: 'L1', action: 'login' }] } },
    '/api/admin/cultivation?action=stats': { ok: true, data: { today: 12 } },
    '/api/admin/embeddings?action=stats': { ok: true, data: { count: 99 } },
    ...overrides,
  } as Record<string, { ok: boolean; data?: unknown }>;
}

function stubGet(map: Record<string, { ok: boolean; data?: unknown }>) {
  M.adminGet.mockImplementation((url: string) => Promise.resolve(map[url] ?? { ok: false, status: 404 }));
}

/**
 * admin/page.tsx (386行) — 系统仪表盘 (五端并发+60s 静默刷新)。
 *
 * 锁定:
 * - 五端 Promise.allSettled 并发拉取
 * - 全 ok → 无"部分失败"横幅
 * - 任一 fail → 降级不炸+错误横幅
 */
describe('AdminDashboardPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('五端并发拉取 (URL 形状锚)', async () => {
    stubGet(okAll());
    render(<AdminDashboardPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledTimes(6)); // 5 并发 + audit recent
    const urls = M.adminGet.mock.calls.map((c) => c[0]);
    expect(urls).toContain('/api/admin/letta');
    expect(urls).toContain('/api/admin/agent-pool');
    expect(urls).toContain('/api/admin/cultivation?action=stats');
    expect(urls).toContain('/api/admin/embeddings?action=stats');
    expect(urls).toContain('/api/admin/audit?page=1&limit=5');
  });

  it('全 ok → 无失败横幅', async () => {
    stubGet(okAll());
    render(<AdminDashboardPage />);
    await waitFor(() => expect(screen.getByText('系统仪表盘')).toBeTruthy());
    await waitFor(() => expect(screen.queryByText(/部分数据加载失败/)).toBeNull());
  });

  it('letta fail → 降级+部分失败横幅 (页面不炸)', async () => {
    stubGet(okAll({ '/api/admin/letta': { ok: false, status: 500 } }));
    render(<AdminDashboardPage />);
    await waitFor(() => expect(screen.getByText(/部分数据加载失败/)).toBeTruthy());
    expect(screen.getByText('系统仪表盘')).toBeTruthy(); // 页面仍渲染
  });

  it('60s 静默刷新 (interval 60000 锚)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubGet(okAll());
    render(<AdminDashboardPage />);
    await vi.waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThanOrEqual(6));
    const before = M.adminGet.mock.calls.length;
    vi.advanceTimersByTime(61_000);
    await vi.waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThan(before)); // 静默轮询
    vi.useRealTimers();
  });
});
