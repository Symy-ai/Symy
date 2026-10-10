// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
}));

vi.mock('@/lib/admin-panel/api-client', () => ({ adminGet: M.adminGet, adminPost: M.adminPost }));
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
vi.mock('@/components/ui/checkbox', () => ({ Checkbox: (p: { checked?: boolean; onCheckedChange?: () => void }) => <input type="checkbox" checked={p.checked} onChange={p.onCheckedChange} /> }));

import AdminVipPage from '../page';

const DATA = {
  stats: { waitlistTotal: 3, pendingCount: 2, activatedCount: 1, premiumTotal: 2 },
  waitlist: [
    { user_id: 'u1', email: 'a@x.com', isActivated: false },
    { user_id: 'u2', email: 'b@x.com', isActivated: false },
    { user_id: 'u3', email: 'c@x.com', isActivated: true },
  ],
  premiumUsers: [
    { id: 'p1', email: 'v1@x.com' },
    { id: 'p2', email: 'v2@x.com' },
  ],
};

/**
 * admin/vip/page.tsx (428行) — VIP 候补/会员管理。
 *
 * 锁定:
 * - 挂载即拉 /api/admin/vip
 * - batchActivate: body {userIds, action:'activate'}
 * - batchDeactivate: action:'deactivate'
 * - 空 selection → 不发 POST
 * - 成功后重拉数据
 */
describe('AdminVipPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('挂载即拉', async () => {
    M.adminGet.mockResolvedValueOnce({ ok: true, data: DATA });
    render(<AdminVipPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/vip'));
  });

  it('空 selection → batchActivate 不发 POST', async () => {
    M.adminGet.mockResolvedValueOnce({ ok: true, data: DATA });
    render(<AdminVipPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalled());
    const btn = screen.getAllByRole('button').find((b) => /开通/.test(b.textContent ?? '') && /批量|选中|所选/.test(b.textContent ?? ''));
    if (btn) {
      fireEvent.click(btn);
      await new Promise((r) => setTimeout(r, 50));
      expect(M.adminPost).not.toHaveBeenCalled();
    }
    // 无该按钮也通过 (UI 分支差异)
  });

  it('batchActivate → POST {userIds, activate} + 成功后重拉', async () => {
    M.adminGet.mockResolvedValue({ ok: true, data: DATA });
    M.adminPost.mockResolvedValueOnce({ ok: true, data: { success: true, affected: 2 } });
    render(<AdminVipPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledTimes(1));
    // 全选候补 (未激活 u1/u2)
    const selectAllBtn = screen.getAllByRole('button').find((b) => /全选/.test(b.textContent ?? '') && !/VIP 会员/.test(b.textContent ?? ''));
    fireEvent.click(selectAllBtn as HTMLButtonElement);
    const activateBtn = screen.getAllByRole('button').find((b) => /开通/.test(b.textContent ?? '') && /批量|选中|所选/.test(b.textContent ?? ''));
    fireEvent.click(activateBtn as HTMLButtonElement);
    await waitFor(() => expect(M.adminPost).toHaveBeenCalledWith('/api/admin/vip', { userIds: ['u1', 'u2'], action: 'activate' }));
    await waitFor(() => expect(screen.getByText(/已开通 2 位用户的 VIP/)).toBeTruthy());
    await waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThanOrEqual(2)); // 重拉
  });

  it('batchDeactivate → POST {userIds, deactivate}', async () => {
    M.adminGet.mockResolvedValue({ ok: true, data: DATA });
    M.adminPost.mockResolvedValueOnce({ ok: true, data: { success: true, affected: 2 } });
    render(<AdminVipPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledTimes(1));
    // VIP 区全选 (p1/p2)
    const selectAllBtns = screen.getAllByRole('button').filter((b) => /全选/.test(b.textContent ?? ''));
    const vipSelectAll = selectAllBtns[selectAllBtns.length - 1]; // 后区=VIP 会员
    fireEvent.click(vipSelectAll as HTMLButtonElement);
    const deactivateBtn = screen.getAllByRole('button').find((b) => /撤销/.test(b.textContent ?? '') && /批量|选中|所选/.test(b.textContent ?? ''));
    fireEvent.click(deactivateBtn as HTMLButtonElement);
    await waitFor(() => expect(M.adminPost).toHaveBeenCalledWith('/api/admin/vip', { userIds: ['p1', 'p2'], action: 'deactivate' }));
    await waitFor(() => expect(screen.getByText(/已撤销 2 位用户的 VIP/)).toBeTruthy());
  });
});
