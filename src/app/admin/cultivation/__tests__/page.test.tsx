// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  adminGet: vi.fn(),
  adminPost: vi.fn(),
}));

vi.mock('@/lib/admin-panel/api-client', () => ({ adminGet: M.adminGet, adminPost: M.adminPost }));
vi.mock('@/components/admin-panel/result-display', () => ({
  ResultDisplay: (p: { result: { status: string; error?: string; action?: string } }) => <div data-testid={`result-${p.result.action ?? 'x'}`} data-status={p.result.status} data-error={p.result.error ?? ''} />,
}));
vi.mock('@/components/ui/card', () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock('@/components/ui/button', () => ({ Button: (p: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => <button onClick={p.onClick} disabled={p.disabled}>{p.children}</button> }));
vi.mock('@/components/ui/input', () => ({ Input: (p: { value?: string; onChange?: (e: { target: { value: string } }) => void }) => <input value={p.value} onChange={p.onChange} /> }));
vi.mock('@/components/ui/label', () => ({ Label: (p: { children: React.ReactNode }) => <label>{p.children}</label> }));
vi.mock('@/components/ui/badge', () => ({ Badge: (p: { children: React.ReactNode }) => <span>{p.children}</span> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  AlertDialogAction: (p: { children: React.ReactNode; onClick?: () => void }) => <button onClick={p.onClick}>{p.children}</button>,
  AlertDialogCancel: (p: { children: React.ReactNode }) => <button>{p.children}</button>,
  AlertDialogContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  AlertDialogDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  AlertDialogFooter: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  AlertDialogHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  AlertDialogTitle: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  AlertDialogTrigger: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

import AdminCultivationPage from '../page';

/**
 * admin/cultivation/page.tsx (315行) — 修身阶段管理。
 *
 * 锁定:
 * - BUG-6 修复锚: 挂载即拉 stats (?action=stats)
 * - profile: user_id URL 编码 + 空 id 拒
 * - assess 空 id → error 不发 POST
 * - assessAll 后 stats 重拉
 */
describe('AdminCultivationPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('BUG-6 锚: 挂载即拉 stats', async () => {
    M.adminGet.mockResolvedValueOnce({ ok: true, data: { total: 10 } });
    render(<AdminCultivationPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/cultivation?action=stats'));
  });

  it('profile: user_id URL 编码透传', async () => {
    M.adminGet.mockResolvedValueOnce({ ok: true, data: { total: 1 } });
    M.adminGet.mockResolvedValueOnce({ ok: true, data: { profile: { stage: 'zhi_yu' } } });
    render(<AdminCultivationPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalled());
    const inputs = document.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'id/with space' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/cultivation?action=profile&user_id=id%2Fwith%20space'));
  });

  it('assess 空 id → error 不发 POST', async () => {
    M.adminGet.mockResolvedValue({ ok: true, data: { total: 0 } });
    render(<AdminCultivationPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalled());
    const btn = screen.getAllByRole('button').find((b) => /评估/.test(b.textContent ?? '') && !/全部|all/i.test(b.textContent ?? ''));
    fireEvent.click(btn as HTMLButtonElement);
    await waitFor(() => expect(screen.getByTestId('result-assess').dataset.status).toBe('error'));
    expect(M.adminPost).not.toHaveBeenCalled();
  });

  it('assessAll → POST assess_all + stats 重拉', async () => {
    M.adminGet.mockResolvedValue({ ok: true, data: { total: 0 } });
    M.adminPost.mockResolvedValueOnce({ ok: true, data: { assessed: 5 } });
    render(<AdminCultivationPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalled());
    const getCalls = M.adminGet.mock.calls.length;
    // Trigger asChild → Button 直渲; AlertDialogAction=确认执行
    const trigger = screen.getAllByRole('button').find((b) => /执行批量/.test(b.textContent ?? ''));
    fireEvent.click(trigger as HTMLButtonElement); // 打开弹层
    const confirm = await screen.findByText('确认执行');
    fireEvent.click(confirm as HTMLElement); // 真调 assessAll
    await waitFor(() => expect(M.adminPost).toHaveBeenCalledWith('/api/admin/cultivation?action=assess_all', {}));
    await waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThan(getCalls));
  });
});
