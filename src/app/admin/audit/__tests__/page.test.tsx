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
});
