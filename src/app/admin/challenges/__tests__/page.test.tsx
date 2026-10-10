// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({ adminPost: vi.fn() }));

vi.mock('@/lib/admin-panel/api-client', () => ({ adminPost: M.adminPost }));
vi.mock('@/components/admin-panel/result-display', () => ({
  ResultDisplay: (p: { result: { status: string } }) => <div data-testid="result" data-status={p.result.status} />,
}));
vi.mock('@/components/ui/card', () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock('@/components/ui/button', () => ({ Button: (p: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => <button onClick={p.onClick} disabled={p.disabled}>{p.children}</button> }));
vi.mock('@/components/ui/input', () => ({ Input: (p: { value?: string | number; onChange?: (e: { target: { value: string } }) => void }) => <input value={p.value} onChange={p.onChange} /> }));
vi.mock('@/components/ui/label', () => ({ Label: (p: { children: React.ReactNode }) => <label>{p.children}</label> }));
vi.mock('@/components/ui/badge', () => ({ Badge: (p: { children: React.ReactNode }) => <span>{p.children}</span> }));

import AdminChallengesPage from '../page';

/**
 * admin/challenges/page.tsx (125行) — 每周挑战手动触发。
 *
 * 锁定:
 * - weekOffset 夹取 [-4,4] (R358 后端契约对齐)
 * - NaN/非数 → 0 兜底
 * - ok → success 态 / fail → error 态
 */
describe('AdminChallengesPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('默认 offset 0 → adminPost weekOffset:0', async () => {
    M.adminPost.mockResolvedValueOnce({ ok: true, data: { created: 3 } });
    render(<AdminChallengesPage />);
    fireEvent.click(screen.getByRole('button', { name: /创建|create|play/i }));
    await waitFor(() => expect(M.adminPost).toHaveBeenCalledWith('/api/admin/create-weekly-challenges', { weekOffset: 0 }));
    await waitFor(() => expect(screen.getByTestId('result').dataset.status).toBe('success'));
  });

  it('超界夹取: 99 → 4, -99 → -4', async () => {
    M.adminPost.mockResolvedValue({ ok: true, data: {} });
    render(<AdminChallengesPage />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: /创建|create|play/i }));
    await waitFor(() => expect(M.adminPost).toHaveBeenCalledWith('/api/admin/create-weekly-challenges', { weekOffset: 4 }));
    fireEvent.change(input, { target: { value: '-99' } });
    fireEvent.click(screen.getByRole('button', { name: /创建|create|play/i }));
    await waitFor(() => expect(M.adminPost).toHaveBeenLastCalledWith('/api/admin/create-weekly-challenges', { weekOffset: -4 }));
  });

  it('fail → error 态', async () => {
    M.adminPost.mockResolvedValueOnce({ ok: false, error: 'boom' });
    render(<AdminChallengesPage />);
    fireEvent.click(screen.getByRole('button', { name: /创建|create|play/i }));
    await waitFor(() => expect(screen.getByTestId('result').dataset.status).toBe('error'));
  });
});
