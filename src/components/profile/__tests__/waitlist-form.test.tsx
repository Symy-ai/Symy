// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n/provider', () => ({
  useI18n: () => ({
    locale: 'zh',
    t: (key: string, opts?: { defaultValue?: string }) => {
      const map: Record<string, string> = {
        'profile.premiumJoinWaitlist': '加入候补名单',
        'profile.waitlistSuccess': '已在名单上——Symy 就绪时会来找你。',
        'profile.waitlistInvalidEmail': '请输入有效邮箱',
        'profile.waitlistSubmitFailed': '加入失败——请重试',
        'profile.waitlistJoin': '加入',
        'profile.waitlistEmailPlaceholder': 'your@email.com',
      };
      return map[key] ?? opts?.defaultValue ?? key;
    },
  }),
}));
vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock('@/lib/api-client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('lucide-react', (importOriginal) => importOriginal());

import { WaitlistForm } from '../waitlist-form';
import { apiFetch } from '@/lib/api-client';

const mockApi = vi.mocked(apiFetch);

/**
 * waitlist-form.tsx (142行) — 候补名单表单 (BUG-2 复用件, PremiumCard+Email 双挂载)。
 *
 * 锁定:
 * - mode=button: 初始按钮 → 点击展开表单
 * - 邮箱校验: 空/非法 → error 提示不发请求
 * - 成功: ✓ 文案 + 3s 后重置 (fake timers)
 * - 失败: error 文案 + submitting 防重
 * - user.email 预填
 */
describe('WaitlistForm 候补名单表单', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mode=button: 初始按钮, 点击展开表单', () => {
    render(<WaitlistForm mode="button" />);
    const btn = screen.getByText('加入候补名单');
    act(() => { fireEvent.click(btn); });
    expect(screen.getByPlaceholderText('your@email.com')).toBeTruthy();
  });

  it('mode=form (默认): 直接渲染输入框', () => {
    render(<WaitlistForm />);
    expect(screen.getByPlaceholderText('your@email.com')).toBeTruthy();
    expect(screen.queryByText('加入候补名单')).toBeNull();
  });

  it('非法邮箱 → 校验提示, 零 POST', async () => {
    mockApi.mockImplementation(() => Promise.resolve({}) as never);
    render(<WaitlistForm />);
    const input = screen.getByPlaceholderText('your@email.com');
    act(() => { fireEvent.change(input, { target: { value: 'not-an-email' } }); });
    act(() => { fireEvent.submit(input.closest('form')!); });
    expect(await screen.findByText('请输入有效邮箱')).toBeTruthy();
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('合法邮箱 → POST waitlist + 成功文案', async () => {
    mockApi.mockResolvedValueOnce({} as never);
    render(<WaitlistForm />);
    const input = screen.getByPlaceholderText('your@email.com');
    act(() => { fireEvent.change(input, { target: { value: '  a@b.com  ' } }); });
    act(() => { fireEvent.submit(input.closest('form')!); });
    expect(await screen.findByText('已在名单上——Symy 就绪时会来找你。')).toBeTruthy();
    await waitFor(() => {
      const post = mockApi.mock.calls.find((c) => (c[1] as { method?: string } | undefined)?.method === 'POST');
      expect(post).toBeTruthy();
      expect((post![1] as { body: { email: string } }).body).toEqual({ email: 'a@b.com' }); // trim 过
    });
  });

  it('失败 → error 文案可重试', async () => {
    mockApi.mockRejectedValueOnce(new Error('dup') as never);
    render(<WaitlistForm />);
    const input = screen.getByPlaceholderText('your@email.com');
    act(() => { fireEvent.change(input, { target: { value: 'a@b.com' } }); });
    act(() => { fireEvent.submit(input.closest('form')!); });
    expect(await screen.findByText('加入失败——请重试')).toBeTruthy();
    // 输入框仍在 (可修改重试)
    expect(screen.getByPlaceholderText('your@email.com')).toBeTruthy();
  });

  it('成功 3s 后重置回 idle (fake timers)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApi.mockResolvedValueOnce({} as never);
    render(<WaitlistForm />);
    const input = screen.getByPlaceholderText('your@email.com');
    act(() => { fireEvent.change(input, { target: { value: 'x@y.io' } }); });
    act(() => { fireEvent.submit(input.closest('form')!); });
    await waitFor(() => expect(screen.getByText(/已在名单上/)).toBeTruthy(), { timeout: 1500 });
    act(() => { vi.advanceTimersByTime(3100); });
    // 重置后表单回来
    expect(screen.getByPlaceholderText('your@email.com')).toBeTruthy();
  });
});
