// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchVoidMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const showToastMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api-client', () => ({
  apiFetchVoid: apiFetchVoidMock,
  ApiError: class ApiError extends Error { status: number; constructor(status: number, msg?: string) { super(msg ?? `api ${status}`); this.status = status; } },
}));
vi.mock('@/lib/toast', () => ({ showToast: showToastMock }));

import { DeleteAccountButton } from '../delete-account-button';
import { ApiError } from '@/lib/api-client';

const stableT = (key: string, opts?: { defaultValue?: string }) => {
  const map: Record<string, string> = {
    'profile.deleteAccount': '删除账号',
    'profile.deleteAccountConfirm': '确定删除账号? 此操作不可撤销。',
    'profile.deleteAccountFailed': '删除失败, 请重试或联系支持。',
  };
  return map[key] ?? opts?.defaultValue ?? key;
};

/**
 * delete-account-button.tsx (53行) — GDPR 第17条被遗忘权 (P0 提取件)。
 *
 * 锁定:
 * - isDemo → null
 * - confirm 取消 → 零请求; 确认 → POST delete-account + 跳转 /
 * - 失败 → error toast (不跳转)
 */
describe('DeleteAccountButton GDPR 删除', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // happy-dom: window.confirm 不存在 — stub
    (window as unknown as { confirm: unknown }).confirm = vi.fn(() => true);
    delete (window as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: '/' };
  });
  afterEach(() => cleanup());

  it('isDemo → null', () => {
    const { container } = render(<DeleteAccountButton isDemo t={stableT} />);
    expect(container.innerHTML).toBe('');
  });

  it('confirm 取消 → 零请求; 确认 → POST + 跳转 /', async () => {
    (window as unknown as { confirm: () => boolean }).confirm = vi.fn(() => false);
    render(<DeleteAccountButton isDemo={false} t={stableT} />);
    fireEvent.click(screen.getByText('删除账号'));
    expect(apiFetchVoidMock).not.toHaveBeenCalled(); // 取消零请求

    (window as unknown as { confirm: () => boolean }).confirm = vi.fn(() => true);
    fireEvent.click(screen.getByText('删除账号'));
    await vi.waitFor(() => expect(apiFetchVoidMock).toHaveBeenCalledWith('/api/user/delete-account', { method: 'POST' }));
    expect((window as unknown as { location: { href: string } }).location.href).toBe('/');
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it('失败 (401) → error toast 不跳转', async () => {
    apiFetchVoidMock.mockRejectedValueOnce(new ApiError(401, 'unauthorized'));
    render(<DeleteAccountButton isDemo={false} t={stableT} />);
    fireEvent.click(screen.getByText('删除账号'));
    await vi.waitFor(() => expect(showToastMock).toHaveBeenCalledWith('删除失败, 请重试或联系支持。', 'error'));
    expect((window as unknown as { location: { href: string } }).location.href).toBe('/'); // 未变 (初始值)
  });
});
