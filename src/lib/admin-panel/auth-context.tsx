'use client';

/**
 * 后台管理系统 — 认证 Context
 *
 * 职责：
 * 1. 管理 ADMIN_API_KEY（sessionStorage）
 * 2. 提供 login / logout 方法
 * 3. 登录守卫：未登录重定向到 /admin/login
 * 4. 注册 401 回调：api-client 收到 401 时自动登出
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  getAdminKey,
  setAdminKey,
  clearAdminKey,
  registerUnauthorizedCallback,
} from './api-client';
import type { AdminAuthState } from './types';

const LOGIN_PATH = '/admin/login';
const ADMIN_PREFIX = '/admin';

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // 首次 mount：从 sessionStorage 读取 key
  useEffect(() => {
    const key = getAdminKey();
    setApiKeyState(key);
    setHydrated(true);
  }, []);

  // 注册 401 自动登出回调
  useEffect(() => {
    registerUnauthorizedCallback(() => {
      clearAdminKey();
      setApiKeyState(null);
      // 避免在 login 页重复跳转
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith(LOGIN_PATH)) {
        router.push(LOGIN_PATH);
      }
    });
  }, [router]);

  // 登录守卫
  useEffect(() => {
    if (!hydrated) return;
    const isAdminRoute = pathname?.startsWith(ADMIN_PREFIX);
    const isLoginRoute = pathname?.startsWith(LOGIN_PATH);
    if (!isAdminRoute) return; // 非 admin 路由不守卫

    if (!apiKey && !isLoginRoute) {
      // 未登录访问 admin → 跳登录
      router.replace(LOGIN_PATH);
    } else if (apiKey && isLoginRoute) {
      // 已登录访问 login → 跳 dashboard
      router.replace('/admin');
    }
  }, [apiKey, hydrated, pathname, router]);

  const login = useCallback((key: string) => {
    const trimmed = key.trim();
    if (!trimmed) return;
    setAdminKey(trimmed);
    setApiKeyState(trimmed);
  }, []);

  const logout = useCallback(() => {
    clearAdminKey();
    setApiKeyState(null);
    router.replace(LOGIN_PATH);
  }, [router]);

  const value: AdminAuthState = {
    isAuthenticated: !!apiKey,
    apiKey,
    login,
    logout,
  };

  // 未 hydrate 时不渲染（避免闪烁 / 守卫误判）
  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="animate-pulse">加载中…</div>
      </div>
    );
  }

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error('useAdminAuth 必须在 AdminAuthProvider 内使用');
  }
  return ctx;
}
