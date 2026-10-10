// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  createClient: vi.fn(),
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
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
vi.mock('next-intl', () => ({ useLocale: () => 'zh' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: M.push }) }));
vi.mock('next/image', () => ({ default: (props: Record<string, unknown>) => <img {...props} alt={String(props.alt ?? '')} /> }));
vi.mock('next/link', () => ({ default: (props: { href: string; children: React.ReactNode }) => <a href={props.href}>{props.children}</a> }));

import SignupPage from '../page';

/**
 * auth/signup/page.tsx (383行) — 注册页。
 *
 * 锁定:
 * - 两次不一致 → 拒
 * - 密码 <6 → 拒
 * - 合法 → signUp emailRedirectTo 带 locale
 * - B2-01: error.message 非串/空 → 兜底文案 (不渲染 "{}")
 * - Google OAuth redirectTo locale callback
 */
describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.configured.mockReturnValue(true);
    M.createClient.mockReturnValue({
      auth: { signUp: M.signUp, signInWithOAuth: M.signInWithOAuth },
    });
  });

  function fillPw(a: string, b: string) {
    const pws = [screen.getByPlaceholderText('auth.placeholders.passwordMinLength'), screen.getByPlaceholderText('••••••••')];
    fireEvent.change(pws[0], { target: { value: a } });
    fireEvent.change(pws[1], { target: { value: b } });
  }

  it('两次不一致 → 拒 (passwordsNoMatch)', async () => {
    render(<SignupPage />);
    fillPw('abc123', 'abc999');
    fireEvent.submit(screen.getByRole('button', { name: /auth.signup.signUp/ }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getAllByText(/auth.signup.errors.passwordsNoMatch/).length).toBeGreaterThan(0));
    expect(M.signUp).not.toHaveBeenCalled();
  });

  it('密码 <6 → 拒', async () => {
    render(<SignupPage />);
    fillPw('abc', 'abc');
    fireEvent.submit(screen.getByRole('button', { name: /auth.signup.signUp/ }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getAllByText(/auth.signup.errors.passwordTooShort/).length).toBeGreaterThan(0));
    expect(M.signUp).not.toHaveBeenCalled();
  });

  it('合法 → signUp 带 locale emailRedirectTo', async () => {
    M.signUp.mockResolvedValueOnce({ error: null });
    render(<SignupPage />);
    fireEvent.change(screen.getByPlaceholderText('auth.placeholders.emailExample'), { target: { value: 'new@user.com' } });
    fillPw('password6', 'password6');
    fireEvent.submit(screen.getByRole('button', { name: /auth.signup.signUp/ }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(M.signUp).toHaveBeenCalledWith({
      email: 'new@user.com',
      password: 'password6',
      options: { emailRedirectTo: 'http://localhost:3000/zh/auth/callback' },
    }));
  });

  it('B2-01: error.message 非串/空 → 兜底文案', async () => {
    M.signUp.mockResolvedValueOnce({ error: { message: '' } });
    render(<SignupPage />);
    fireEvent.change(screen.getByPlaceholderText('auth.placeholders.emailExample'), { target: { value: 'x@y.com' } });
    fillPw('password6', 'password6');
    fireEvent.submit(screen.getByRole('button', { name: /auth.signup.signUp/ }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/auth.signup.errors.serviceNotConfigured/)).toBeTruthy()); // 兜底而非 "{}"
  });

  it('Google OAuth → redirectTo locale callback', async () => {
    M.signInWithOAuth.mockResolvedValueOnce({ error: null });
    render(<SignupPage />);
    fireEvent.click(await waitFor(() => screen.getByRole('button', { name: /continueWithGoogle|Google/i })));
    await waitFor(() => expect(M.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      options: { redirectTo: 'http://localhost:3000/zh/auth/callback' },
    })));
  });

  it('P1-A03: 未勾 ToS/Privacy → submit 按钮硬 disabled (GDPR 敏感数据同意门)', () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByPlaceholderText('auth.placeholders.emailExample'), { target: { value: 'a@b.com' } });
    fillPw('password6', 'password6');
    // 勾选框未勾
    const submitBtn = screen.getByRole('button', { name: /auth.signup.signUp/ }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    // 勾上 → 解锁
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(submitBtn.disabled).toBe(false);
  });

  it('P2-7: 实时 email 校验 — "test@" 无域名 → emailInvalid 提示', async () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByPlaceholderText('auth.placeholders.emailExample'), { target: { value: 'test@' } });
    await waitFor(() => expect(screen.getByText(/Please enter a valid email address/)).toBeTruthy());
  });

  it('P1-A03: ToS/Privacy 链接双锚 → /zh/legal/{terms,privacy} (新窗口)', () => {
    render(<SignupPage />);
    const links = screen.getAllByRole('link');
    const terms = links.find((l) => l.getAttribute('href') === '/zh/legal/terms') as HTMLAnchorElement;
    const privacy = links.find((l) => l.getAttribute('href') === '/zh/legal/privacy') as HTMLAnchorElement;
    expect(terms).toBeTruthy();
    expect(privacy).toBeTruthy();
    expect(terms.target).toBe('_blank');
    expect(terms.rel).toContain('noopener');
  });
});
