// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navState = { pushed: [] as string[], replaced: [] as string[], pathname: '/admin' };
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (p: string) => navState.pushed.push(p),
    replace: (p: string) => navState.replaced.push(p),
  }),
  usePathname: () => navState.pathname,
}));
const apiState = { stored: null as string | null, unauthorizedCb: null as (() => void) | null };
vi.mock('../api-client', () => {
  return {
    getAdminKey: () => apiState.stored,
    setAdminKey: (k: string) => { apiState.stored = k; },
    clearAdminKey: () => { apiState.stored = null; },
    registerUnauthorizedCallback: (cb: () => void) => { apiState.unauthorizedCb = cb; },
  };
});

import { AdminAuthProvider, useAdminAuth } from '../auth-context';

function Probe() {
  const auth = useAdminAuth();
  return (
    <div>
      <span data-testid="authed">{String(auth.isAuthenticated)}</span>
      <button data-testid="login" onClick={() => auth.login('  new-key  ')}>login</button>
      <button data-testid="logout" onClick={auth.logout}>logout</button>
    </div>
  );
}

function renderUI(pathname = '/admin') {
  navState.pathname = pathname;
  return render(
    <AdminAuthProvider>
      <Probe />
    </AdminAuthProvider>,
  );
}

/**
 * auth-context.tsx (107行) — admin 认证 Context (key 管理+守卫+401 回调)。
 *
 * 锁定:
 * - 初始未登录 (sessionStorage 空)
 * - login: trim 存储 + 状态更新; 空串拒绝
 * - logout: 清 key + replace 登录页
 * - 守卫: 未登录访问 admin → replace login; 已登录访问 login → replace dashboard
 * - 401 回调注册: 触发时清 key
 */
describe('AdminAuthProvider 认证 Context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    apiState.stored = null;
    apiState.unauthorizedCb = null;
    navState.pushed = [];
    navState.replaced = [];
  });
  afterEach(() => cleanup());

  it('初始未登录 (authed=false)', async () => {
    renderUI('/admin/login'); // login 页不触发守卫
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
  });

  it('login: trim 后存储 + 状态翻转', async () => {
    renderUI('/admin/login');
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    act(() => { screen.getByTestId('login').click(); });
    expect(screen.getByTestId('authed').textContent).toBe('true');
    expect(apiState.stored).toBe('new-key'); // trim 过
  });

  it('logout: 清 key + replace /admin/login', async () => {
    renderUI('/admin');
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    act(() => { screen.getByTestId('login').click(); });
    act(() => { screen.getByTestId('logout').click(); });
    expect(screen.getByTestId('authed').textContent).toBe('false');
    expect(apiState.stored).toBeNull();
    expect(navState.replaced).toContain('/admin/login');
  });

  it('守卫: 未登录访问 /admin → replace 登录页', async () => {
    renderUI('/admin');
    await waitFor(() => expect(navState.replaced).toContain('/admin/login'));
  });

  it('守卫: 已登录访问 login → replace dashboard', async () => {
    apiState.stored = 'existing-key';
    renderUI('/admin/login');
    await waitFor(() => expect(navState.replaced).toContain('/admin'));
  });

  it('401 回调: 注册且触发时清 key', async () => {
    apiState.stored = 'k';
    renderUI('/admin/login');
    await waitFor(() => expect(apiState.unauthorizedCb).toBeTruthy());
    apiState.unauthorizedCb!();
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    expect(apiState.stored).toBeNull();
  });

  it('非 admin 路由不守卫 (零 replace)', async () => {
    renderUI('/butterfly');
    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    expect(navState.replaced).toEqual([]);
  });
});
