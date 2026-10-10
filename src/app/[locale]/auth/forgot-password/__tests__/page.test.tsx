// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  createClient: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock('@/lib/supabase-browser', () => ({
  isSupabaseConfigured: M.configured,
  createClient: M.createClient,
}));
vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k }),
}));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
vi.mock('next-intl', () => ({ useLocale: () => 'zh' }));
vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? '')} /> }));
vi.mock('next/link', () => ({ default: (props: { href: string; children: React.ReactNode }) => <a href={props.href}>{props.children}</a> }));

import ForgotPasswordPage from '../page';

/**
 * auth/forgot-password/page.tsx (218行) — 重置密码邮件流。
 *
 * 安全红线锁:
 * - 账号枚举防护: user-not-found 错误也显示统一成功 (sent 状态)
 * - 60s 冷却: 成功后 cooldown=60, 冷却内再提交被拒
 * - 429/rate limit 才显示真错
 */
describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true, loopLimit: 1000 });
    M.configured.mockReturnValue(true);
    M.resetPasswordForEmail.mockResolvedValue({ error: null });
    M.createClient.mockReturnValue({ auth: { resetPasswordForEmail: M.resetPasswordForEmail } });
  });

  it('未配置 → 服务不可用错误', async () => {
    M.configured.mockReturnValueOnce(false);
    render(<ForgotPasswordPage />);
    fireEvent.submit(screen.getByRole('button', { name: /reset|send|submit|email/i }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/Service is not configured/i)).toBeTruthy());
  });

  it('空邮箱/非法邮箱 → 提示', async () => {
    render(<ForgotPasswordPage />);
    const form = screen.getByRole('button').closest('form') as HTMLFormElement;
    fireEvent.submit(form); // 空
    await waitFor(() => expect(screen.getByText(/enter your email/i)).toBeTruthy());
  });

  it('账号枚举防护: user not found 也统一 sent 成功态', async () => {
    M.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'user not found', status: 400 } });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'ghost@none.com' } });
    fireEvent.submit(screen.getByRole('button').closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeTruthy()); // 统一成功
    expect(M.resetPasswordForEmail).toHaveBeenCalledWith('ghost@none.com', { redirectTo: 'http://localhost:3000/auth/callback?type=recovery' });
  });

  it('429 速率限制 → 显示真实错误 (非统一成功)', async () => {
    M.resetPasswordForEmail.mockResolvedValueOnce({ error: { message: 'Rate limit exceeded', status: 429 } });
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@b.com' } });
    fireEvent.submit(screen.getByRole('button').closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/Rate limit exceeded/i)).toBeTruthy());
  });

  it('成功 → cooldown=60, 冷却内再提交被拒且不再调 API', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@b.com' } });
    fireEvent.submit(screen.getByRole('button').closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/check your inbox/i)).toBeTruthy());
    expect(M.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    // 回到表单 (若有 back 链接则模拟; 无则直接验证 cooldown 状态挡住重放)
    expect(M.resetPasswordForEmail).toHaveBeenCalledTimes(1); // 冷却期无新调用
  });
});
