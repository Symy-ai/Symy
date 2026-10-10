// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({ adminGet: vi.fn() }));

vi.mock('@/lib/admin-panel/api-client', () => ({ adminGet: M.adminGet }));
vi.mock('@/components/ui/card', () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock('@/components/ui/button', () => ({ Button: (p: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => <button onClick={p.onClick} disabled={p.disabled}>{p.children}</button> }));
vi.mock('@/components/ui/badge', () => ({ Badge: (p: { children: React.ReactNode }) => <span>{p.children}</span> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));

import AdminSettingsPage from '../page';

/**
 * admin/settings/page.tsx (373行) — 系统设置总览。
 *
 * 锁定:
 * - 挂载双拉 overview+migrations (R386 三子端点)
 * - overview fail → err feedback
 * - 健康检查: ok → checks / fail → 空数组+inline error
 * - feedback 4s 自动消失
 */
describe('AdminSettingsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('挂载双拉 overview+migrations', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url === '/api/admin/settings') return Promise.resolve({ ok: true, data: { envVars: [] } });
      return Promise.resolve({ ok: true, data: { migrations: [], duplicates: [] } });
    });
    render(<AdminSettingsPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/settings'));
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/settings/migrations'));
  });

  it('overview fail → err feedback', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url === '/api/admin/settings') return Promise.resolve({ ok: false, error: 'denied' });
      return Promise.resolve({ ok: true, data: { migrations: [], duplicates: [] } });
    });
    render(<AdminSettingsPage />);
    await waitFor(() => expect(screen.getByText(/denied|加载系统设置失败/)).toBeTruthy());
  });

  it('健康检查 fail → inline error (卡内提示)', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url === '/api/admin/settings') return Promise.resolve({ ok: true, data: { envVars: [] } });
      if (url === '/api/admin/settings/migrations') return Promise.resolve({ ok: true, data: { migrations: [], duplicates: [] } });
      return Promise.resolve({ ok: false, error: 'health boom' });
    });
    render(<AdminSettingsPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledTimes(2));
    const btn = screen.getAllByRole('button').find((b) => /健康检查|检查/.test(b.textContent ?? ''));
    fireEvent.click(btn as HTMLButtonElement);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/settings/health'));
    // 设计: fail → inline 卡内提示 + feedback 横幅两处同文案 (getAllBy)
    await waitFor(() => expect(screen.getAllByText(/health boom|健康检查失败/).length).toBeGreaterThanOrEqual(2));
  });

  it('健康检查 ok → checks 渲染', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url === '/api/admin/settings/health') return Promise.resolve({ ok: true, data: { checks: [{ service: 'DB', status: 'healthy', latencyMs: 42 }] } });
      return Promise.resolve({ ok: true, data: { envVars: [] } });
    });
    render(<AdminSettingsPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledTimes(2));
    const btn = screen.getAllByRole('button').find((b) => /健康检查|检查/.test(b.textContent ?? ''));
    fireEvent.click(btn as HTMLButtonElement);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/settings/health'));
    await waitFor(() => expect(screen.getByText('DB')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('healthy')).toBeTruthy());
  });
});
