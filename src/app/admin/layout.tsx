'use client';

/**
 * 后台管理系统 — 根 Layout
 *
 * 职责：
 * 1. 包裹 AdminAuthProvider（管理 key + 登录守卫）
 * 2. 渲染侧边栏 + 顶栏 + 主内容区（登录页除外）
 * 3. 响应式：移动端侧边栏变 Sheet Drawer
 */

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { AdminAuthProvider, useAdminAuth } from '@/lib/admin-panel/auth-context';
import { NAV_GROUPS } from '@/lib/admin-panel/nav-config';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ShieldCheck,
  LogOut,
  Menu,
  ExternalLink,
  Github,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const LOGIN_PATH = '/admin/login';

function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { logout, isAuthenticated } = useAdminAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // 持久化折叠状态到 localStorage
  useEffect(() => {
    const saved = localStorage.getItem('symy_admin_sidebar_collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);
  useEffect(() => {
    localStorage.setItem('symy_admin_sidebar_collapsed', String(collapsed));
  }, [collapsed]);

  // 登录页：全屏，不渲染 shell
  if (pathname === LOGIN_PATH) {
    return <>{children}</>;
  }

  // 未登录访问 admin（非 login 页）：渲染 loading，等守卫 redirect（避免短暂泄露 admin 内容）
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
          <div className="text-sm">正在跳转到登录页…</div>
        </div>
      </div>
    );
  }

  const SidebarContent = (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Logo / 折叠按钮 */}
      <div className={`flex h-16 items-center gap-2 border-b border-zinc-800 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-sm font-bold">Symy Admin</div>
            <div className="text-[10px] text-zinc-500">管理后台</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {group.title}
                </div>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  const link = (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center rounded-md text-sm transition-colors ${
                        collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'
                      } ${
                        active
                          ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20'
                          : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                      {!collapsed && item.todo && (
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] text-amber-300">
                          待开发
                        </Badge>
                      )}
                    </Link>
                  );
                  // 折叠时用 Tooltip 显示标签
                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right" className="bg-zinc-800 text-zinc-100">
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }
                  return link;
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-zinc-800 p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className={`w-full text-zinc-400 hover:bg-rose-500/10 hover:text-rose-300 ${collapsed ? 'justify-center px-2' : 'justify-start'}`}
        >
          <LogOut className={`h-4 w-4 shrink-0 ${collapsed ? '' : 'mr-2'}`} />
          {!collapsed && '退出登录'}
        </Button>
      </div>
    </div>
  );

  // 当前页面标题
  const currentItem = NAV_GROUPS.flatMap((g) => g.items).find(
    (i) => i.href === pathname,
  );
  const pageTitle = currentItem?.label || 'Admin';

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* 桌面侧边栏 */}
      <aside className={`relative hidden shrink-0 md:block transition-all ${collapsed ? 'w-16' : 'w-60'}`}>
        <div className="sticky top-0 h-screen">{SidebarContent}</div>
        {/* 折叠按钮 */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 shadow-sm transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </aside>

      {/* 移动端侧边栏（Sheet） */}
      <div className="flex items-center gap-3 border-b bg-zinc-950 p-3 text-zinc-100 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-zinc-300">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 border-zinc-800 p-0">
            <SheetTitle className="sr-only">导航菜单</SheetTitle>
            {SidebarContent}
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">Symy Admin</span>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex min-h-screen flex-1 flex-col">
        {/* 顶栏 */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold">{pageTitle}</h1>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-600">
              ADMIN
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link href="/" target="_blank">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                <span className="hidden sm:inline">主站</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <a href="https://github.com/Symy-ai/WeAreAllMe" target="_blank" rel="noreferrer">
                <Github className="mr-1.5 h-3.5 w-3.5" />
                <span className="hidden sm:inline">GitHub</span>
              </a>
            </Button>
          </div>
        </header>

        {/* 内容 */}
        <main className="flex-1 p-4 md:p-6">{children}</main>

        {/* Footer (sticky bottom) */}
        <footer className="mt-auto border-t bg-background px-4 py-3 text-center text-xs text-muted-foreground md:px-6">
          Symy AI Admin Panel · 仅限授权管理员使用 · 所有操作已审计
        </footer>
      </div>
    </div>
    </TooltipProvider>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShell>{children}</AdminShell>
    </AdminAuthProvider>
  );
}
