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

import AdminEmbeddingsPage from '../page';

/**
 * admin/embeddings/page.tsx (258行) — RAG 向量库管理。
 *
 * 锁定:
 * - 挂载即拉 stats (?action=stats)
 * - user_stats: userId URL 编码透传
 * - backfill_user 空 userId → error 态不发请求
 * - backfill_all 有 AlertDialog 确认门 (⚠️ 危险操作)
 */
describe('AdminEmbeddingsPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('挂载即拉 stats', async () => {
    M.adminGet.mockResolvedValueOnce({ ok: true, data: { total: 100 } });
    render(<AdminEmbeddingsPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/embeddings?action=stats'));
  });

  it('user_stats: userId URL 编码透传', async () => {
    M.adminGet.mockResolvedValueOnce({ ok: true, data: { total: 100 } });
    M.adminGet.mockResolvedValueOnce({ ok: true, data: { count: 5 } });
    render(<AdminEmbeddingsPage />);
    const input = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'user/with space' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalledWith('/api/admin/embeddings?action=user_stats&user_id=user%2Fwith%20space'));
  });

  it('backfill_user 空 userId → error 不发', async () => {
    M.adminGet.mockResolvedValue({ ok: true, data: { total: 0 } });
    render(<AdminEmbeddingsPage />);
    await waitFor(() => expect(M.adminGet).toHaveBeenCalled());
    const btns = screen.getAllByRole('button');
    const backfillBtn = btns.find((b) => /backfill|回填/i.test(b.textContent ?? '') && !/all|全部/i.test(b.textContent ?? ''));
    fireEvent.click(backfillBtn as HTMLButtonElement);
    await waitFor(() => expect(screen.getByTestId('result-backfill_user').dataset.status).toBe('error'));
    expect(M.adminPost).not.toHaveBeenCalled();
  });
});
