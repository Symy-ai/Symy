/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
import 'server-only'; // 🔧 ARCH fix Round 73: server-only — prevents client bundle leak
/**
 * withAdminAudit — admin 操作审计日志中间件
 *
 * 🔧 ARCH fix (Round 13 BUG-14):
 *    旧代码: admin 操作无审计日志, 多 admin 协作时无问责
 *    根因修复: 此 helper 包装 admin handler, 异步写入 admin_audit_logs 表
 *
 * 🔧 ARCH fix (Round 14 ADV-R14-1): 加 actionOverride 参数
 *    letta POST 的 action 在 body 而非 query string, 调用方传 ctx.action 覆盖
 *
 * 用法:
 *   export async function POST(req: NextRequest) {
 *     const authResult = verifyAdminAuth(req);
 *     if (!authResult.authorized) return NextResponse.json({ error: authResult.error }, { status: 401 });
 *     return withAdminAudit(req, authResult, async () => {
 *       // ... handler 逻辑 ...
 *       return NextResponse.json({ success: true });
 *     });
 *   }
 *
 *   // action 在 body 的路由 (如 letta):
 *   return withAdminAudit(request, authResult, async () => handler(ctx), ctx.action);
 *
 * 注: 审计日志写入失败不阻断主请求 (fire-and-forget + try/catch)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import type { AdminAuthResult } from '@/lib/admin-auth';

/**
 * 🔧 ARCH fix (Round 21 BUG-R21-C2): waitUntil helper
 *    旧代码用 void fire-and-forget → Vercel 杀函数后 INSERT 未完成 → 审计日志丢失。
 *    根因修复: 用 @vercel/functions waitUntil 延长函数生命周期; fallback 到 fire-and-forget。
 *    模式与 embed-backfill.ts:431-438 一致。
 *
 * 🔧 ARCH fix (Round 22 BUG-R22-C1): 导出 fireAndForgetSafely 供其他模块复用
 *    chat/route.ts 的 logAIBehavior 也用此 helper 防 Vercel kill 丢失审计日志。
 */
export function fireAndForgetSafely(promise: Promise<unknown>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { waitUntil } = require('@vercel/functions');
    if (typeof waitUntil === 'function') {
      waitUntil(promise);
      return;
    }
  } catch {
    // @vercel/functions 不可用 (本地开发/非 Vercel) — fire-and-forget
  }
  // fallback: void (旧行为, Vercel 可能杀函数)
  void promise;
}

/**
 * 🔧 ARCH fix (Round 15 ADV-R14-3): 记录未授权 admin 访问尝试
 *    旧代码: withAdminAudit 只在 authorized=true 时调用 → 暴力破解不入审计
 *    根因修复: 新增 logUnauthorizedAdminAttempt, 在 401/403 return 前调用 (fire-and-forget)
 *    用法:
 *      const authResult = verifyAdminAuth(req);
 *      if (!authResult.authorized) {
 *        void logUnauthorizedAdminAttempt(req, authResult);
 *        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
 *      }
 */
export function logUnauthorizedAdminAttempt(
  request: NextRequest,
  authResult: AdminAuthResult,
): void {
  try {
    const { supabase } = createAdminClient();
    if (!supabase) return;
    const url = new URL(request.url);
    // 🔧 ARCH fix (Round 21 BUG-R21-C2): 用 waitUntil 防 Vercel 杀函数丢失审计日志
    const auditPromise = Promise.resolve(supabase.from('admin_audit_logs').insert({
      actor: authResult.actor || 'unauthorized',
      route: url.pathname,
      method: request.method,
      action: url.searchParams.get('action'),
      request_query: Object.fromEntries(url.searchParams),
      status_code: 403,
      error_message: authResult.error ?? 'Unauthorized',
      ip_address: request.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim() ||
        request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
        request.headers.get('x-real-ip')?.trim() || null,
      user_agent: request.headers.get('user-agent'),
    })).then(({ error: auditError }) => {
      if (auditError) {
        logger.warn('[Admin Audit] unauthorized attempt write failed (non-critical):', auditError.message);
      }
    }).catch((e: unknown) => {
      logger.error('[Admin Audit] unauthorized attempt exception (non-critical):', e);
    });
    fireAndForgetSafely(auditPromise);
      // safe to ignore: non-critical background operation, error already logged
  } catch (e) {
    logger.error('[Admin Audit] unauthorized attempt setup exception (non-critical):', e);
  }
}

export async function withAdminAudit(
  request: NextRequest,
  authResult: AdminAuthResult,
  handler: () => NextResponse | Promise<NextResponse>,
  // 🔧 ARCH fix (Round 14 ADV-R14-1): actionOverride — 当 action 在 body 而非 query string 时
  //    letta POST 的 action 在 body.action, 调用方传 ctx.action 覆盖 url.searchParams.get('action')
  actionOverride?: string,
): Promise<NextResponse> {
  let response: NextResponse;
  let errorMessage: string | undefined;

  try {
    response = await handler();
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    response = NextResponse.json(
      { error: 'Internal server error', detail: errorMessage },
      { status: 500 },
    );
  }

  // 异步写入审计日志 (fire-and-forget, 不阻断主请求)
  // 🔧 ARCH fix (ADV-R13-5): 旧代码 await 审计写入 → 阻断 HTTP 响应。改用 void (不 await)。
  // 🔧 ARCH fix (Round 21 BUG-R21-C2): void 仍会被 Vercel 杀函数丢失, 改用 waitUntil。
  try {
    const { supabase } = createAdminClient();
    if (supabase) {
      const url = new URL(request.url);
      // 🔧 ADV-R14-1: actionOverride 优先于 query string
      const action = actionOverride ?? url.searchParams.get('action');
      const auditPromise = Promise.resolve(supabase.from('admin_audit_logs').insert({
        actor: authResult.actor || 'unknown',
        route: url.pathname,
        method: request.method,
        action,
        request_query: Object.fromEntries(url.searchParams),
        status_code: response.status,
        error_message: errorMessage ?? null,
        ip_address: request.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim() ||
        request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
        request.headers.get('x-real-ip')?.trim() || null,
        user_agent: request.headers.get('user-agent'),
      })).then(({ error: auditError }) => {
        if (auditError) {
          logger.warn('[Admin Audit] write failed (non-critical):', auditError.message);
        }
      }).catch((e: unknown) => {
        logger.error('[Admin Audit] exception (non-critical):', e);
      });
      fireAndForgetSafely(auditPromise);
    }
      // safe to ignore: non-critical background operation, error already logged
  } catch (e) {
    logger.error('[Admin Audit] setup exception (non-critical):', e);
  }

  return response;
}
