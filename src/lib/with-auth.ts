import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * withAuth — Higher-Order Function for authenticated API routes.
 *
 * 🔧 ARCH fix (Round 54 R54-Bug1 — mergeCookies + auth 样板重复 9 个 route):
 *    旧代码: 每个 API route 手动:
 *      1. const { supabase, user, error, mergeCookies } = await createAuthenticatedClient(request);
 *      2. if (error || !user || !supabase) return mergeCookies(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));
 *      3. try { ... 业务逻辑 ... } catch { return mergeCookies(NextResponse.json({ error: 'Internal server error' }, { status: 500 })); }
 *
 *    问题: 9 个 route 重复这 3 步, 容易忘记 mergeCookies (cookie 丢失), 容易忘记 try/catch
 *    (错误泄漏), 容易忘记 401 检查 (鉴权绕过)。
 *
 *    根因修复: 提取 withAuth HOF, 架构层统一处理 auth + cookie + error, 业务代码只写业务逻辑。
 *
 * 🔧 ARCH fix (Round 55 REVIEW-A-1 — withAuth 自动 merge cookies 到 success response):
 *    旧代码 (R54): handler 返回 result 后直接 return, 不自动 mergeCookies。
 *    问题: 业务代码仍需手动调 mergeCookies, 否则 cookie 丢失 (与 R54 的核心承诺矛盾)。
 *    根因修复: 自动检测 response 类型 (NextResponse / plain Response) 并 merge cookies。
 *    业务代码现在可以只 return NextResponse.json(...) 不调 mergeCookies, 架构层自动处理。
 *
 * 复杂度转移: 业务代码从 ~15 行样板降到 ~3 行 (只写 handler body, 不需要 mergeCookies)。
 *
 * @example
 * ```ts
 * // Before (15 lines):
 * export async function POST(request: NextRequest) {
 *   const { supabase, user, error, mergeCookies } = await createAuthenticatedClient(request);
 *   if (error || !user || !supabase) {
 *     return mergeCookies(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }));
 *   }
 *   try {
 *     const body = await request.json();
 *     // ... business logic ...
 *     return mergeCookies(NextResponse.json({ success: true }));
 *   } catch (err) {
 *     logger.error('Failed:', err);
 *     return mergeCookies(NextResponse.json({ error: 'Internal server error' }, { status: 500 }));
 *   }
 * }
 *
 * // After (5 lines) — mergeCookies 自动调用, 业务代码不需要管:
 * export const POST = withAuth(async ({ supabase, user, request }) => {
 *   const body = await request.json();
 *   // ... business logic ...
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedClient } from '@/lib/supabase-api';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/error-utils';

export interface AuthContext {
  /** Authenticated Supabase client (RLS-enabled) */
  supabase: NonNullable<Awaited<ReturnType<typeof createAuthenticatedClient>>['supabase']>;
  /** The authenticated user */
  user: NonNullable<Awaited<ReturnType<typeof createAuthenticatedClient>>['user']>;
  /** The original request */
  request: NextRequest;
}

export type AuthedHandler = (ctx: AuthContext) => Promise<NextResponse | Response>;

/**
 * Handler type for routes with dynamic params (e.g. /api/buddy/dream-funds/[fundId]/history).
 * 🔧 ARCH fix (2026-07-21): Extended withAuth to support dynamic route params.
 *    Before: dynamic routes couldn't use withAuth → they used manual createAuthenticatedClient
 *    After: dynamic routes use withAuth with params passed in the context
 */
export type AuthedHandlerWithParams<P> = (ctx: AuthContext & { params: P }) => Promise<NextResponse | Response>;

/**
 * Wrap an API route handler with authentication + cookie merging + error handling.
 *
 * - If auth fails → returns 401 with cookies merged
 * - If handler throws → returns 500 with cookies merged + logs error
 * - If handler succeeds → returns handler's response with cookies auto-merged
 *
 * The handler only needs to implement business logic — no auth/cookie/error boilerplate.
 * The handler can return NextResponse or plain Response (for SSE) — cookies are auto-merged.
 */
export function withAuth(handler: AuthedHandler): (request: NextRequest) => Promise<NextResponse | Response>;
/**
 * Overload for dynamic routes with params (e.g. /api/items/[id]).
 * 🔧 ARCH fix (2026-07-21): Allows dynamic routes to use withAuth.
 *
 * @example
 * ```ts
 * export const GET = withAuth<{ fundId: string }>(async ({ supabase, user, params }) => {
 *   const { fundId } = await params; // params is a Promise in Next.js 15+
 *   // ... business logic ...
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withAuth<P>(handler: AuthedHandlerWithParams<P>): (request: NextRequest, context: { params: Promise<P> }) => Promise<NextResponse | Response>;
export function withAuth<P = unknown>(handler: AuthedHandler | AuthedHandlerWithParams<P>): (request: NextRequest, context?: { params: Promise<P> }) => Promise<NextResponse | Response> {
  return async (request: NextRequest, context?: { params: Promise<P> }): Promise<NextResponse | Response> => {
    const { supabase, user, error, mergeCookies, mergeCookiesOnResponse } = await createAuthenticatedClient(request);

    // Auth check — unified 401 response
    if (error || !user || !supabase) {
      return mergeCookies(
        NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
      );
    }

    try {
      // If context with params is provided, resolve params and pass to handler
      const ctx: AuthContext & { params?: P } = { supabase, user, request };
      if (context?.params) {
        ctx.params = await context.params;
      }
      const result = await (handler as AuthedHandlerWithParams<P>)(ctx as AuthContext & { params: P });

      // 🔧 ARCH fix (Round 55 REVIEW-A-1): Auto-merge cookies into success response.
      // Detect response type and use appropriate merge function.
      // This eliminates the #1 bug class: forgetting to call mergeCookies.
      if (result instanceof NextResponse) {
        // 🔧 2026-07-15 (deep audit UNFIXED #7): Set Cache-Control: no-store on all
        // withAuth responses — prevents CDN from caching user-specific data (cross-user PII leak)
        result.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return mergeCookies(result);
      } else if (result instanceof Response) {
        result.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return mergeCookiesOnResponse(result);
      }
      // Fallback: return as-is (shouldn't happen with correct handler types)
      return result;
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      // Unified error handling — log + 500 with cookies merged
      logger.error('[withAuth] Handler error:', getErrorMessage(err));
      return mergeCookies(
        NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        )
      );
    }
  };
}

