// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
  adminDelete: vi.fn(),
}));

vi.mock('@/lib/admin-panel/api-client', () => ({
  adminGet: M.adminGet,
  adminPost: M.adminPost,
  adminDelete: M.adminDelete,
}));
vi.mock('@/components/ui/card', () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock('@/components/ui/button', () => ({ Button: (p: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: string }) => <button onClick={p.onClick} disabled={p.disabled} data-variant={p.variant}>{p.children}</button> }));
vi.mock('@/components/ui/input', () => ({ Input: (p: { value?: string; onChange?: (e: { target: { value: string } }) => void; placeholder?: string }) => <input value={p.value} onChange={p.onChange} placeholder={p.placeholder} /> }));
vi.mock('@/components/ui/badge', () => ({ Badge: (p: { children: React.ReactNode }) => <span>{p.children}</span> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/ui/select', () => ({
  Select: (p: { children: React.ReactNode; onValueChange?: (v: string) => void }) => <div>{p.children}</div>,
  SelectContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SelectItem: (p: { value?: string; children: React.ReactNode }) => <div data-value={p.value}>{p.children}</div>,
  SelectTrigger: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SelectValue: (p: { placeholder?: string }) => <span>{p.placeholder}</span>,
}));
vi.mock('@/components/ui/checkbox', () => ({ Checkbox: (p: { checked?: boolean; onCheckedChange?: () => void }) => <input type="checkbox" checked={p.checked} onChange={p.onCheckedChange} /> }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: (p: { children: React.ReactNode; open?: boolean }) => <div>{p.children}</div>,
  DialogContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  DialogDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  DialogFooter: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  DialogHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  DialogTitle: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock('@/components/ui/alert', () => ({
  Alert: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  AlertDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock('@/components/ui/label', () => ({ Label: (p: { children: React.ReactNode }) => <label>{p.children}</label> }));

import AdminUsersPage from '../page';

function usersRes(users: unknown[] = [], total = 0) {
  return { ok: true, data: { users, total, page: 1, totalPages: 1 } };
}

/**
 * admin/users/page.tsx (775行) — 用户管理 (战役最大页面件)。
 *
 * 锁定:
 * - 挂载即拉 users (page=1&limit 形状)
 * - 搜索 debounce 300ms 后才带 search 参
 * - runBatch body 锚 ({action, userIds})
 * - fail → err feedback 不炸
 */
describe('AdminUsersPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('挂载即拉 (page=1&limit 形状)', async () => {
    M.adminGet.mockResolvedValueOnce(usersRes());
    render(<AdminUsersPage />);
    await waitFor(() => {
      const call = M.adminGet.mock.calls.find((c) => String(c[0]).includes('/api/admin/users?'));
      expect(String(call?.[0])).toMatch(/page=1&limit=\d+/);
    });
  });

  it('搜索 debounce 300ms → search 参数生效', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    M.adminGet.mockResolvedValue(usersRes());
    render(<AdminUsersPage />);
    await vi.waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThanOrEqual(1));
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'spark' } });
    vi.advanceTimersByTime(350);
    await vi.waitFor(() => {
      const call = M.adminGet.mock.calls.find((c) => String(c[0]).includes('search=spark'));
      expect(call).toBeTruthy();
    });
    vi.useRealTimers();
  });

  it('fail → err feedback (页面不炸)', async () => {
    M.adminGet.mockResolvedValueOnce({ ok: false, error: 'denied' });
    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText(/denied|加载用户列表失败/)).toBeTruthy());
  });

  it('批量解封 → POST {action:unban, userIds}', async () => {
    M.adminGet.mockResolvedValue(usersRes([
      { id: 'u1', email: 'a@x.com', banned: true },
    ]));
    M.adminPost.mockResolvedValueOnce({ ok: true });
    render(<AdminUsersPage />);
    await vi.waitFor(() => expect(screen.getByText('a@x.com')).toBeTruthy());
    // 勾选 u1
    const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    // 批量解封按钮
    const unbanBtn = screen.getAllByRole('button').find((b) => /解封/.test(b.textContent ?? ''));
    fireEvent.click(unbanBtn as HTMLButtonElement);
    await waitFor(() => expect(M.adminPost).toHaveBeenCalledWith('/api/admin/users', { action: 'unban', userIds: ['u1'] }));
    await waitFor(() => expect(screen.getByText(/操作完成（1 个用户）/)).toBeTruthy());
  });

  it('plan 过滤 → plan=premium 参', async () => {
    M.adminGet.mockResolvedValue(usersRes());
    render(<AdminUsersPage />);
    await vi.waitFor(() => expect(screen.getByText(/共/)).toBeTruthy());
    const planSelect = document.querySelectorAll('select')[0] as HTMLSelectElement;
    fireEvent.change(planSelect, { target: { value: 'premium' } });
    await vi.waitFor(() => {
      const call = M.adminGet.mock.calls.find((c) => String(c[0]).includes('plan=premium'));
      expect(call).toBeTruthy();
    });
  });

  it('status 过滤 → banned=true 参 (banned ↔ true 映射锚)', async () => {
    M.adminGet.mockResolvedValue(usersRes());
    render(<AdminUsersPage />);
    await vi.waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThanOrEqual(1));
    const statusSelect = document.querySelectorAll('select')[1] as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: 'banned' } });
    await vi.waitFor(() => {
      const call = M.adminGet.mock.calls.find((c) => String(c[0]).includes('banned=true'));
      expect(call).toBeTruthy();
    });
  });

  it('勾选后 → 已选计数 + 批量封禁 POST {action:ban, userIds, banned_until, reason}', async () => {
    M.adminGet.mockResolvedValue(usersRes([
      { id: 'u1', email: 'ban@x.com', banned: false },
    ]));
    M.adminPost.mockResolvedValueOnce({ ok: true });
    render(<AdminUsersPage />);
    await vi.waitFor(() => expect(screen.getByText('ban@x.com')).toBeTruthy());
    const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    await vi.waitFor(() => expect(screen.getByText(/已选 1 个用户/)).toBeTruthy());
    const banBtn = screen.getAllByRole('button').find((b) => /批量封禁/.test(b.textContent ?? ''));
    fireEvent.click(banBtn as HTMLButtonElement);
    // 两步流: 弹窗内确认封禁才 POST
    await waitFor(() => expect(screen.getByText('确认封禁')).toBeTruthy());
    fireEvent.click(screen.getByText('确认封禁'));
    await waitFor(() => {
      const call = M.adminPost.mock.calls.find((c) => c[0] === '/api/admin/users');
      expect(call?.[1]).toMatchObject({ action: 'ban', userIds: ['u1'] });
    });
  });

  it('分页 → 下一页 page=2 参', async () => {
    M.adminGet.mockResolvedValue({ ok: true, data: { users: [{ id: 'u1', email: 'p@x.com' }], total: 30, page: 1, totalPages: 2 } });
    render(<AdminUsersPage />);
    await vi.waitFor(() => expect(screen.getByText('p@x.com')).toBeTruthy());
    const next = screen.getAllByRole('button').find((b) => /下一页/.test(b.textContent ?? ''));
    expect(next).toBeTruthy();
    fireEvent.click(next as HTMLButtonElement);
    await vi.waitFor(() => {
      const call = M.adminGet.mock.calls.find((c) => /page=2/.test(String(c[0])));
      expect(call).toBeTruthy();
    });
  });
});
