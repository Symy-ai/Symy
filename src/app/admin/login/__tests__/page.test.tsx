// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const M = vi.hoisted(() => ({
  login: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('@/lib/admin-panel/auth-context', () => ({
  useAdminAuth: () => ({ login: M.login }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => M.params,
}));
vi.mock('next/link', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));
vi.mock('@/components/ui/button', () => ({ Button: (p: { children: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit' | 'reset' }) => <button type={p.type ?? 'button'} onClick={p.onClick}>{p.children}</button> }));
vi.mock('@/components/ui/input', () => ({ Input: (p: { name?: string; type?: string; value?: string }) => <input {...p} /> }));
vi.mock('@/components/ui/label', () => ({ Label: (p: { children: React.ReactNode }) => <label>{p.children}</label> }));
vi.mock('@/components/ui/card', () => ({
  Card: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardFooter: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardHeader: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  CardTitle: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock('@/components/ui/alert', () => ({
  Alert: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  AlertDescription: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

import AdminLoginPage from '../page';

/**
 * admin/login/page.tsx (185行) — 后台 API key 门禁。
 *
 * 锁定:
 * - 手动提交: 空 key 拒; 401/403 → 无效错误; 其他状态 → login()
 * - URL ?key= 自动验证 (非 401/403 → login)
 * - FormData 直读 (非 React state)
 */
describe('AdminLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    M.params = new URLSearchParams();
  });

  afterEach(() => vi.restoreAllMocks());

  it('空 key → 拒 (不发 fetch)', async () => {
    render(<AdminLoginPage />);
    // disabled={!key.trim()} 拦 UI 路径 — 直接 form submit 验证兜底分支
    const form = document.querySelector('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText('请输入 ADMIN_API_KEY')).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 → 无效错误, 不 login', async () => {
    fetchMock.mockResolvedValueOnce({ status: 401 } as Response);
    render(<AdminLoginPage />);
    const input = document.querySelector('input[name="apikey"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'bad-key' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getByText(/API Key 无效或权限不足/)).toBeTruthy());
    expect(M.login).not.toHaveBeenCalled();
  });

  it('200 → login(key) (Bearer 头锚)', async () => {
    fetchMock.mockResolvedValueOnce({ status: 200 } as Response);
    render(<AdminLoginPage />);
    const input = document.querySelector('input[name="apikey"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'my-secret' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);
    await waitFor(() => expect(M.login).toHaveBeenCalledWith('my-secret'));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/audit?action=stats', {
      headers: { Authorization: 'Bearer my-secret' },
    });
  });

  it('URL ?key= 有效 → 自动 login', async () => {
    M.params = new URLSearchParams('key=url-key');
    fetchMock.mockResolvedValueOnce({ status: 200 } as Response);
    render(<AdminLoginPage />);
    await waitFor(() => expect(M.login).toHaveBeenCalledWith('url-key'));
  });

  it('URL ?key= 403 → URL key 无效', async () => {
    M.params = new URLSearchParams('key=bad');
    fetchMock.mockResolvedValueOnce({ status: 403 } as Response);
    render(<AdminLoginPage />);
    await waitFor(() => expect(screen.getByText('URL key 无效')).toBeTruthy());
    expect(M.login).not.toHaveBeenCalled();
  });
});
