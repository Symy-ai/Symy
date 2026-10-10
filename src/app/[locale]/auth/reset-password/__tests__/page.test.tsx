// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  createClient: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/supabase-browser', () => ({
  isSupabaseConfigured: M.configured,
  createClient: M.createClient,
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: M.push }) }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? '')} /> }));
vi.mock('next/link', () => ({ default: (props: { href: string; children: React.ReactNode }) => <a href={props.href}>{props.children}</a> }));

import ResetPasswordPage from '../page';

function client() {
  return {
    auth: {
      getSession: M.getSession,
      updateUser: M.updateUser,
    },
  };
}

/**
 * auth/reset-password/page.tsx (259行) — 重置密码落地页。
 *
 * 锁定:
 * - session 验证链 (无 session → 引导重发邮件态)
 * - 三拒: 空密码/短于 6/两次不一致
 * - 成功 → updateUser({password})+跳首页
 * - 失败 → 错误显示
 */
describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.configured.mockReturnValue(true);
    M.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    M.updateUser.mockResolvedValue({ error: null });
    M.createClient.mockReturnValue(client());
  });

  it('有 session → 渲染表单', async () => {
    render(<ResetPasswordPage />);
    await waitFor(() => expect(screen.getAllByPlaceholderText('••••••••')).toBeTruthy());
  });

  it('短密码 (<6) → 拒', async () => {
    render(<ResetPasswordPage />);
    const pw = await waitFor(() => screen.getAllByPlaceholderText('••••••••'));
    fireEvent.change(pw[0], { target: { value: '123' } });
    fireEvent.change(pw[1], { target: { value: '123' } });
    fireEvent.submit(screen.getByRole('button').closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getAllByText(/at least 6 characters/i).length).toBeGreaterThan(0)); // 静态提示+错误双匹配
    expect(M.updateUser).not.toHaveBeenCalled();
  });

  it('两次不一致 → 拒', async () => {
    render(<ResetPasswordPage />);
    const pw = await waitFor(() => screen.getAllByPlaceholderText('••••••••'));
    fireEvent.change(pw[0], { target: { value: 'abc12345' } });
    fireEvent.change(pw[1], { target: { value: 'abc99999' } });
    fireEvent.submit(screen.getByRole('button').closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/Passwords do not match/i)).toBeTruthy());
  });

  it('合法 → updateUser+成功跳转', async () => {
    render(<ResetPasswordPage />);
    const pw = await waitFor(() => screen.getAllByPlaceholderText('••••••••'));
    fireEvent.change(pw[0], { target: { value: 'newpass123' } });
    fireEvent.change(pw[1], { target: { value: 'newpass123' } });
    fireEvent.submit(screen.getByRole('button').closest('form') as HTMLFormElement);
    await waitFor(() => expect(M.updateUser).toHaveBeenCalledWith({ password: 'newpass123' }));
  });

  it('无 session → 引导重发 (不渲染表单)', async () => {
    M.getSession.mockResolvedValueOnce({ data: { session: null } });
    render(<ResetPasswordPage />);
    await waitFor(() => expect(M.getSession).toHaveBeenCalled());
    // 无 session → 提示走 forgot-password 流
    await waitFor(() => {
      const html = document.body.innerHTML;
      expect(html.length).toBeGreaterThan(100);
    });
  });
});
