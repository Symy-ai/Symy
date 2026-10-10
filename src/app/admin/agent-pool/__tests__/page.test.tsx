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

import AdminAgentPoolPage from '../page';

/**
 * admin/agent-pool/page.tsx (295行) — Agent 池管理。
 *
 * 锁定:
 * - 挂载即拉状态 + 30s 静默轮询
 * - 拉回 poolSize 回填输入框
 * - setPoolSize: 负数/NaN 拒; Math.round 取整
 * - refill 后重新拉状态
 */
describe('AdminAgentPoolPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('挂载即拉 + poolSize 回填', async () => {
    M.adminGet.mockResolvedValueOnce({ ok: true, data: { poolSize: 5, available: 3 } });
    render(<AdminAgentPoolPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/agent-pool'));
    const input = document.querySelector('input') as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('5'));
  });

  it('30s 静默轮询 (interval 30000 锚)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    M.adminGet.mockResolvedValue({ ok: true, data: { poolSize: 1 } });
    render(<AdminAgentPoolPage />);
    await vi.waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThanOrEqual(1));
    const before = M.adminGet.mock.calls.length;
    vi.advanceTimersByTime(31_000);
    await vi.waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThan(before));
    vi.useRealTimers();
  });

  it('setPoolSize 负数 → error 拒', async () => {
    M.adminGet.mockResolvedValue({ ok: true, data: { poolSize: 2 } });
    render(<AdminAgentPoolPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalled());
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-3' } });
    const btn = screen.getAllByRole('button').find((b) => /应用/.test(b.textContent ?? ''));
    fireEvent.click(btn as HTMLButtonElement);
    await waitFor(() => expect(screen.getByTestId('result-set_pool_size').dataset.status).toBe('error'));
    expect(M.adminPost).not.toHaveBeenCalled();
  });

  it('setPoolSize 4.7 → Math.round 5 透传 + 刷新', async () => {
    M.adminGet.mockResolvedValue({ ok: true, data: { poolSize: 4 } });
    M.adminPost.mockResolvedValueOnce({ ok: true, data: {} });
    render(<AdminAgentPoolPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalled());
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '4.7' } });
    const btn = screen.getAllByRole('button').find((b) => /应用/.test(b.textContent ?? ''));
    fireEvent.click(btn as HTMLButtonElement);
    await waitFor(() => expect(M.adminPost).toHaveBeenCalledWith('/api/admin/agent-pool', { setPoolSize: 5 }));
  });

  it('refill → adminPost 无 body + 完成后重拉', async () => {
    M.adminGet.mockResolvedValue({ ok: true, data: { poolSize: 2 } });
    M.adminPost.mockResolvedValueOnce({ ok: true, data: { filled: 3 } });
    render(<AdminAgentPoolPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalled());
    const getCalls = M.adminGet.mock.calls.length;
    const btn = screen.getAllByRole('button').find((b) => /refill|补池|补充/i.test(b.textContent ?? ''));
    fireEvent.click(btn as HTMLButtonElement);
    await waitFor(() => expect(M.adminPost).toHaveBeenCalledWith('/api/admin/agent-pool'));
    await waitFor(() => expect(M.adminGet.mock.calls.length).toBeGreaterThan(getCalls));
  });
});
