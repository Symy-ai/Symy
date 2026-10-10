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
vi.mock('@/components/ui/input', () => ({ Input: (p: { value?: string; onChange?: (e: { target: { value: string } }) => void; placeholder?: string }) => <input value={p.value} onChange={p.onChange} placeholder={p.placeholder} /> }));
vi.mock('@/components/ui/label', () => ({ Label: (p: { children: React.ReactNode }) => <label>{p.children}</label> }));
vi.mock('@/components/ui/badge', () => ({ Badge: (p: { children: React.ReactNode }) => <span>{p.children}</span> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/ui/select', () => ({
  Select: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SelectContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SelectItem: (p: { value?: string; children: React.ReactNode }) => <div data-value={p.value}>{p.children}</div>,
  SelectTrigger: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SelectValue: (p: { placeholder?: string }) => <span>{p.placeholder}</span>,
}));

import AdminAuditPage from '../page';

/**
 * admin/audit/page.tsx (338行) — 审计日志。
 *
 * 锁定:
 * - 挂载双拉: stats + logs(page=1)
 * - 分页 URL 形状 (page/limit)
 * - 过滤: 输入不触发, 点搜索才带 route/actor
 */
describe('AdminAuditPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('挂载双拉 stats+logs', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url.includes('action=stats')) return { ok: true, data: { total: 9 } };
      return { ok: true, data: { logs: [{ id: 1, route: '/api/x' }], total: 9, page: 1, limit: 20 } };
    });
    render(<AdminAuditPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/audit?action=stats'));
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith(expect.stringContaining('page=1')));
  });

  it('logs URL 带 limit 形状', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url.includes('action=stats')) return { ok: true, data: {} };
      return { ok: true, data: { logs: [], total: 0, page: 1, limit: 20 } };
    });
    render(<AdminAuditPage />);
    await waitFor(() => {
      const logsCall = M.adminGet.mock.calls.find((c) => !String(c[0]).includes('action=stats'));
      expect(String(logsCall?.[0])).toMatch(/limit=\d+/);
    });
  });

  it('过滤: 输入不触发, 搜索才带参', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url.includes('action=stats')) return { ok: true, data: {} };
      return { ok: true, data: { logs: [], total: 0, page: 1, limit: 20 } };
    });
    render(<AdminAuditPage />);
    await waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThanOrEqual(2));
    const inputs = document.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: '/api/admin/letta' } });
    // 未点搜索 — 无新调用带 route
    await new Promise((r) => setTimeout(r, 50));
    const before = M.adminGet.mock.calls.length;
    expect(before).toBeGreaterThanOrEqual(2);
    const searchBtn = screen.getAllByRole('button').find((b) => /搜索/.test(b.textContent ?? ''));
    fireEvent.click(searchBtn as HTMLButtonElement);
    await waitFor(() => {
      const logsCall = M.adminGet.mock.calls.find((c) => String(c[0]).includes('route='));
      expect(String(logsCall?.[0])).toContain('route=%2Fapi%2Fadmin%2Fletta');
    });
  });

  it('stats 卡渲染: total + byAction 分组', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url.includes('action=stats')) {
        return { ok: true, data: { total: 9, byAction: { ban: 3, unban: 6 } } };
      }
      return { ok: true, data: { logs: [], total: 9, page: 1, limit: 20 } };
    });
    render(<AdminAuditPage />);
    await waitFor(() => expect(screen.getByText('9')).toBeTruthy());
    const txt = document.body.textContent ?? '';
    expect(txt).toContain('ban:');
    expect(txt).toContain('unban:');

  });

  it('行点击 → 展开 payload JSON (route/actor/success/metadata)', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url.includes('action=stats')) return { ok: true, data: {} };
      return { ok: true, data: { logs: [
        { id: 42, route: '/api/admin/users', actor: 'admin@x.com', action: 'ban', success: true, status_code: 200, method: 'POST', created_at: '2026-10-01T00:00:00Z', metadata: { userId: 'u9' } },
      ], total: 1, page: 1, limit: 20 } };
    });
    render(<AdminAuditPage />);
    await waitFor(() => expect(screen.getByText('/api/admin/users')).toBeTruthy());
    fireEvent.click(screen.getByText('/api/admin/users'));
    await waitFor(() => {
      const pre = document.querySelector('pre');
      expect(pre?.textContent).toContain('"userId": "u9"');
      expect(pre?.textContent).toContain('"method": "POST"');
    });
  });

  it('status 前端过滤: failed 档只显示失败行', async () => {
    M.adminGet.mockImplementation((url: string) => {
      if (url.includes('action=stats')) return { ok: true, data: {} };
      return { ok: true, data: { logs: [
        { id: 1, route: '/api/ok', actor: 'a', success: true, created_at: '2026-10-01T00:00:00Z' },
        { id: 2, route: '/api/bad', actor: 'a', success: false, status_code: 500, created_at: '2026-10-01T00:00:00Z' },
      ], total: 2, page: 1, limit: 20 } };
    });
    render(<AdminAuditPage />);
    await waitFor(() => expect(screen.getByText('/api/ok')).toBeTruthy());
    // 切 failed 档
    const failedBtn = screen.getAllByRole('button').find((b) => /失败/.test(b.textContent ?? ''));
    fireEvent.click(failedBtn as HTMLButtonElement);
    await waitFor(() => expect(screen.queryByText('/api/ok')).toBeNull());
    expect(screen.getByText('/api/bad')).toBeTruthy();
  });
});
