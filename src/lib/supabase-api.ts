/**
 * 服务端 API 路由专用的 Supabase 客户端
 *
 * 使用 @supabase/ssr 的 createServerClient 携带用户 cookie，
 * 这样 auth.uid() 有值，RLS 策略正常放行。
 *
 * 重要：setAll 会收集需要刷新的 cookie，API 路由返回响应时
 * 必须调用 mergeCookies(response) 把新 cookie 写回浏览器，
 * 否则 token 刷新后会丢失，导致后续请求 401。
 *
 * 用法:
 *   const { supabase, user, error, mergeCookies } = await createAuthenticatedClient(request);
 *   if (error || !user) return mergeCookies(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));
 *   // ... 业务逻辑 ...
 *   return mergeCookies(NextResponse.json({ data }));
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/lib/database.types';

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };

// 🔧 Round 123 audit fix: 显式返回类型, 让 json helper 在所有分支都可调用
//    旧代码: 返回类型是 union (error case vs success case), TS 无法推断 json 可调用
//    → 103 个 ESLint warnings (require-json-helper-in-authenticated-routes)
//    新代码: 统一返回类型 AuthenticatedClient, json 始终可调用
//    supabase 用 SupabaseClient<Database> 提供 typed query builder
type JsonHelper = <T extends Record<string, unknown>>(data: T, init?: ResponseInit) => NextResponse;
type MergeCookiesFn = <T extends NextResponse>(response: T) => T;
type MergeCookiesOnResponseFn = (response: Response) => Response;

export interface AuthenticatedClient {
  supabase: ReturnType<typeof createServerClient<Database>> | null;
  user: { id: string; email?: string } | null;
  error: string | null;
  mergeCookies: MergeCookiesFn;
  mergeCookiesOnResponse: MergeCookiesOnResponseFn;
  pendingCookies: CookieToSet[];
  json: JsonHelper;
}

export async function createAuthenticatedClient(request: NextRequest): Promise<AuthenticatedClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // 支持新版 Publishable Key (sb_publishable_...) 和旧版 anon key (eyJ...)
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const noOpMerge = <T extends NextResponse>(res: T) => res;
    const noOpMergeResponse = (res: Response) => res;
    const noOpJson = <T extends Record<string, unknown>>(data: T, init?: ResponseInit): NextResponse => NextResponse.json(data, init);
    return { supabase: null, user: null, error: 'Supabase not configured' as const, mergeCookies: noOpMerge, mergeCookiesOnResponse: noOpMergeResponse, pendingCookies: [] as CookieToSet[], json: noOpJson };
  }

  // Collect cookies that Supabase wants to set (e.g. refreshed tokens)
  let pendingCookies: CookieToSet[] = [];

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies: CookieToSet[]) {
        // 🔧 ARCH fix (Round 19 BUG-R19D-M6 — pendingCookies 替换式赋值, 多次 setAll 时早期 cookie 丢失):
        //    旧代码: pendingCookies = cookies; — 替换, 不是 append。
        //    若 Supabase 调 setAll 两次 (e.g., refreshSession 后 getUser 再触发 token 更新),
        //    第一次的 cookie 全清掉, mergeCookies 只 set 第二次的 cookies。
        //    根因修复: merge 模式 — 后设的同名 cookie 覆盖前设的, 不同名 cookie 保留。
        const existing = new Map(pendingCookies.map(c => [c.name, c]));
        for (const c of cookies) existing.set(c.name, c);
        pendingCookies = Array.from(existing.values());
        // Also update request cookies so subsequent reads within the same request see the new values
        cookies.forEach(({ name, value }) => request.cookies.set(name, value));
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  /**
   * Merge any cookies set by Supabase (e.g. refreshed auth tokens) into the response.
   * Every API route MUST wrap its return value with this to avoid token refresh being lost.
   */
  const mergeCookies = <T extends NextResponse>(response: T): T => {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options as Record<string, string | number | Date | boolean>);
    });
    return response;
  };

  /**
   * 🔧 ARCH fix (Round 3 SSE H3): merge cookies on a plain Response (not NextResponse).
   *
   * SSE routes return `new Response(stream, { headers })` instead of `NextResponse.json()`.
   * `mergeCookies` only works on NextResponse (uses response.cookies.set).
   * This helper manually appends `Set-Cookie` headers to a plain Response, preserving
   * refreshed auth tokens that would otherwise be lost on long SSE streams.
   */
  const mergeCookiesOnResponse = (response: Response): Response => {
    pendingCookies.forEach(({ name, value, options }) => {
      // Build Set-Cookie header value manually
      const parts = [`${name}=${value}`];
      if (options.path) parts.push(`Path=${options.path}`);
      // 🔧 ARCH fix (Round 75 ARCH-DEEP-75 — maxAge=0 静默丢失, cookie 删除失效):
      //    旧代码: if (options.maxAge) — maxAge=0 是 falsy → Max-Age=0 不被写入 Set-Cookie header。
      //    后果: SSE/plain Response 路径 (用 mergeCookiesOnResponse) 在 Supabase sign-out
      //    (cookie 删除, maxAge=0) 时, Set-Cookie 没有 Max-Age=0 → 浏览器视为 session cookie
      //    (关闭浏览器才删除), 用户"登出"后 cookie 仍存活 → 安全风险。
      //    根因修复: 用 !== undefined && !== null 检查 (0 是合法值)。
      if (options.maxAge !== undefined && options.maxAge !== null) parts.push(`Max-Age=${options.maxAge}`);
      if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
      if (options.secure) parts.push('Secure');
      if (options.httpOnly) parts.push('HttpOnly');
      response.headers.append('Set-Cookie', parts.join('; '));
    });
    return response;
  };

  /**
   * 🔧 Round 101 architectural fix: Auto-merging JSON response helper.
   *
   * Replaces `mergeCookies(NextResponse.json(data, opts))` with `json(data, opts)`.
   * This prevents the bug class where developers forget to wrap with mergeCookies,
   * losing refreshed auth tokens. Every response from an authenticated route should
   * use this helper instead of NextResponse.json directly.
   *
   * Usage:
   *   const { supabase, user, json } = await createAuthenticatedClient(request);
   *   if (!user) return json({ error: 'Not authenticated' }, { status: 401 });
   *   return json({ data: 'result' });
   */
  const json = <T extends Record<string, unknown>>(data: T, init?: ResponseInit): NextResponse => {
    return mergeCookies(NextResponse.json(data, init));
  };

  return { supabase, user, error: error?.message || null, mergeCookies, mergeCookiesOnResponse, pendingCookies, json };
}
