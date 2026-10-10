// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  configured: vi.fn(() => true),
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
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

import LoginPage from '../page';

function setup() {
  M.createClient.mockReturnValue({
    auth: {
      signInWithPassword: M.signInWithPassword,
      signInWithOAuth: M.signInWithOAuth,
      signInWithOtp: M.signInWithOtp,
    },
  });
}

/**
 * auth/login/page.tsx (505行) — 登录页 (P1-6/P1-8/P0 修件)。
 *
 * 锁定:
 * - 密码登录: 空/非法邮箱/缺密码三拒 (P1-8)
 * - 凭据错 → 友好文案 (P0: 不泄原始 message)
 * - Google OAuth: redirectTo 带 locale callback
 * - magic link: 60s 冷却 (P1-6 枚举防) + 统一 sent 态 (不泄账号存在)
 */
describe('LoginPage 密码登录', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
    sessionStorage.clear();
  });

  it('空邮箱 → 拒 (P1-8)', async () => {
    render(<LoginPage />);
    fireEvent.submit(screen.getByRole('button', { name: /auth.login.signIn/ }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/enter your email/i)).toBeTruthy());
    expect(M.signInWithPassword).not.toHaveBeenCalled();
  });

  it('凭据错 → 友好文案不泄原始信息 (P0)', async () => {
    M.signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    render(<LoginPage />);
    const inputs = [screen.getByPlaceholderText('auth.placeholders.emailExample'), screen.getByPlaceholderText('••••••••')];
    fireEvent.change(inputs[0], { target: { value: 'a@b.com' } });
    fireEvent.change(inputs[1], { target: { value: 'wrong' } });
    fireEvent.submit(screen.getByRole('button', { name: /auth.login.signIn/ }).closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/Incorrect email or password/i)).toBeTruthy());
  });
});

describe('LoginPage Google OAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
    sessionStorage.clear();
  });

  it('signInWithOAuth redirectTo 带 locale callback', async () => {
    M.signInWithOAuth.mockResolvedValueOnce({ error: null });
    render(<LoginPage />);
    const googleBtn = await waitFor(() => screen.getByRole('button', { name: /google/i }));
    fireEvent.click(googleBtn);
    await waitFor(() => expect(M.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'google',
      options: { redirectTo: 'http://localhost:3000/zh/auth/callback' },
    })));
  });
});

describe('LoginPage magic link (P1-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
    sessionStorage.clear();
  });

  it('60s 冷却: 二连发被拒', async () => {
    M.signInWithOtp.mockResolvedValue({ error: null });
    render(<LoginPage />);
    const emailInput = screen.getByPlaceholderText('auth.placeholders.emailExample');
    fireEvent.change(emailInput, { target: { value: 'a@b.com' } });
    const magicBtn = await waitFor(() => screen.getAllByRole('button').find((b) => /auth.login.sendMagicLink/.test(b.textContent ?? '')));
    fireEvent.click(magicBtn as HTMLButtonElement);
    await waitFor(() => expect(M.signInWithOtp).toHaveBeenCalledTimes(1));
    // 立即二连发 → 冷却拒
    fireEvent.click(magicBtn as HTMLButtonElement);
    await waitFor(() => expect(sessionStorage.getItem('symy_magic_link_last_time')).toBeTruthy());
    expect(M.signInWithOtp).toHaveBeenCalledTimes(1); // 未发第二次
  });

  it('user-not-found 也统一 sent 态 (枚举防)', async () => {
    M.signInWithOtp.mockResolvedValueOnce({ error: { message: 'user not found', status: 400 } });
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('auth.placeholders.emailExample'), { target: { value: 'ghost@none.com' } });
    const magicBtn = await waitFor(() => screen.getAllByRole('button').find((b) => /auth.login.sendMagicLink/.test(b.textContent ?? '')));
    fireEvent.click(magicBtn as HTMLButtonElement);
    await waitFor(() => {
      const txt = document.body.textContent ?? '';
      expect(/check your email|inbox|查看邮箱|sent/i.test(txt)).toBeTruthy(); // 统一成功
    });
  });

  it('forgot-password 链接: 输入 email 后带 ?email= (N23 联动)', () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('auth.placeholders.emailExample'), { target: { value: 'spark@x.com' } });
    const forgot = screen.getByText('Forgot password?').closest('a');
    expect(forgot?.getAttribute('href')).toBe('/auth/forgot-password?email=spark%40x.com');
  });

  it('signup 链接: locale 前缀 + email 透传', () => {
    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText('auth.placeholders.emailExample'), { target: { value: 'go@x.com' } });
    const signup = screen.getByText(/auth.login.signUp|create account/i).closest('a') ?? screen.getAllByRole('link').find((a) => /signup/.test(a.getAttribute('href') ?? ''));
    expect(signup?.getAttribute('href')).toBe('/zh/auth/signup?email=go%40x.com');
  });

  it('?email= URL 参数 → 输入框预填 (signup→login 联动, Bug #29/N23)', async () => {
    window.history.replaceState({}, '', '/zh/auth/login?email=prefill@x.com');
    render(<LoginPage />);
    const input = screen.getByPlaceholderText('auth.placeholders.emailExample') as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('prefill@x.com'));
    window.history.replaceState({}, '', '/zh/auth/login');
  });
});
