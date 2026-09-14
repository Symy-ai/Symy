/**
 * 后台管理系统 — Admin API 客户端封装
 *
 * 职责：
 * 1. 自动附加 Authorization: Bearer <key> header
 * 2. 统一错误处理 + 401 自动登出
 * 3. 提供 adminGet / adminPost 便捷方法
 *
 * ⛔ 仅在 /admin/* 客户端组件中使用
 * ⛔ 不引入任何 server-side secret key
 */

import type { ApiResponse } from './types';

const ADMIN_KEY_STORAGE = 'symy_admin_key';

/** 读取 sessionStorage 中的 ADMIN_API_KEY */
export function getAdminKey(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(ADMIN_KEY_STORAGE);
}

/** 写入 ADMIN_API_KEY */
export function setAdminKey(key: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

/** 清除 ADMIN_API_KEY */
export function clearAdminKey(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}

/** 401 回调 — 由 auth-context 注册，避免循环依赖 */
let onUnauthorizedCallback: (() => void) | null = null;

export function registerUnauthorizedCallback(cb: () => void): void {
  onUnauthorizedCallback = cb;
}

/**
 * 核心 fetch 封装
 *
 * @param path - API 路径（相对，如 /api/admin/letta）
 * @param options - fetch options
 * @returns ApiResponse
 */
export async function adminFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const key = getAdminKey();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  // GET 请求不带 Content-Type，其它方法默认 application/json
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  try {
    const res = await fetch(path, {
      ...options,
      headers,
    });

    // 401 → 自动登出（key 失效）
    // 403 不自动登出：可能是"无 header"（首次加载 key 未就绪）或"权限不足"，不应清除 key
    if (res.status === 401) {
      clearAdminKey();
      if (onUnauthorizedCallback) onUnauthorizedCallback();
      return {
        ok: false,
        status: res.status,
        data: null,
        error: '认证失败，已自动登出',
      };
    }

    // 尝试解析 JSON
    let data: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      let errMsg = `请求失败 (${res.status})`;
      if (data && typeof data === 'object' && 'error' in data) {
        errMsg = String((data as Record<string, unknown>).error);
      }
      return {
        ok: false,
        status: res.status,
        data: data as T | null,
        error: errMsg,
      };
    }

    return {
      ok: true,
      status: res.status,
      data: data as T,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      data: null,
      error: `网络错误: ${message}`,
    };
  }
}

/** GET 便捷方法 */
export function adminGet<T = unknown>(path: string): Promise<ApiResponse<T>> {
  return adminFetch<T>(path, { method: 'GET' });
}

/** POST 便捷方法 */
export function adminPost<T = unknown>(
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  return adminFetch<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** PATCH 便捷方法 */
export function adminPatch<T = unknown>(
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  return adminFetch<T>(path, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** DELETE 便捷方法 */
export function adminDelete<T = unknown>(path: string): Promise<ApiResponse<T>> {
  return adminFetch<T>(path, { method: 'DELETE' });
}
