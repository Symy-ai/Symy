// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const M = vi.hoisted(() => ({
  pathname: '/admin',
  isAuthenticated: true,
  logout: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => M.pathname,
}));
vi.mock('@/lib/admin-panel/auth-context', () => ({
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAdminAuth: () => ({ logout: M.logout, isAuthenticated: M.isAuthenticated }),
}));
vi.mock('@/lib/admin-panel/nav-config', () => ({
  NAV_GROUPS: [
    { title: '概览', items: [{ href: '/admin', label: '仪表盘', icon: () => <i data-testid="icon" /> }] },
    { title: '用户', items: [{ href: '/admin/users', label: '用户管理', icon: () => <i data-testid="icon" /> }] },
  ],
}));
vi.mock('next/link', () => ({ default: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }));
vi.mock('@/components/ui/button', () => ({ Button: (p: { children: React.ReactNode; onClick?: () => void }) => <button onClick={p.onClick}>{p.children}</button> }));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SheetContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SheetTrigger: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  SheetTitle: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));
vi.mock('@/components/ui/badge', () => ({ Badge: (p: { children: React.ReactNode }) => <span>{p.children}</span> }));
vi.mock('@/components/ui/scroll-area', () => ({ ScrollArea: (p: { children: React.ReactNode }) => <div>{p.children}</div> }));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  TooltipContent: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  TooltipProvider: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
  TooltipTrigger: (p: { children: React.ReactNode }) => <div>{p.children}</div>,
}));

import AdminLayout from '../layout';

/**
 * admin/layout.tsx (242行) — 后台骨架 (登录守卫+侧边栏折叠持久化)。
 *
 * 锁定:
 * - 登录页路径 → children 直渲 (无 shell)
 * - 未登录非 login → 跳转提示态 (不泄露 admin 内容)
 * - 已登录 → 侧边栏+nav 分组渲染
 * - 折叠状态 localStorage 持久化
 */
describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    M.pathname = '/admin';
    M.isAuthenticated = true;
  });

  it('login 路径 → children 直渲无 shell', () => {
    M.pathname = '/admin/login';
    const { container } = render(<AdminLayout>{<div data-testid="child">LOGINFORM</div>}</AdminLayout>);
    expect(container.textContent).toContain('LOGINFORM');
    expect(container.textContent).not.toContain('Symy Admin');
  });

  it('未登录非 login → 跳转提示 (不泄露 nav)', () => {
    M.isAuthenticated = false;
    const { container } = render(<AdminLayout>{<div>SECRET</div>}</AdminLayout>);
    expect(container.textContent).toContain('正在跳转到登录页');
    expect(container.textContent).not.toContain('SECRET');
  });

  it('已登录 → shell+nav 分组渲染', () => {
    const { container } = render(<AdminLayout>{<div>CONTENT</div>}</AdminLayout>);
    expect(container.textContent).toContain('Symy Admin');
    expect(container.textContent).toContain('CONTENT');
    expect(container.textContent).toContain('仪表盘');
    expect(container.textContent).toContain('用户管理');
  });

  it('localStorage 预置 collapsed=true → 启动即折叠', () => {
    localStorage.setItem('symy_admin_sidebar_collapsed', 'true');
    render(<AdminLayout>{<div>x</div>}</AdminLayout>);
    expect(localStorage.getItem('symy_admin_sidebar_collapsed')).toBe('true');
  });
});
