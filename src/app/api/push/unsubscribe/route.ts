/**
 * DELETE /api/push/unsubscribe — 取消订阅 Web Push 通知
 *
 * 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with 6 mergeCookies calls — now handled automatically by withAuth).
 *
 * 请求体:
 * { endpoint: string }
 *
 * 响应:
 * - 200: { success: true }
 * - 400: 验证失败
 * - 401: 未登录 (handled by withAuth)
 * - 500: 服务器错误
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export const DELETE = withAuth(async ({ supabase, user, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // safe to ignore: invalid JSON from client, return 400
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parseResult = unsubscribeSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parseResult.error.issues },
      { status: 400 },
    );
  }

  const { endpoint } = parseResult.data;

  try {
    // 🔧 P0 fix (2026-08-14): use authenticated client + RLS instead of admin bypass.
    //   Admin client ignores RLS, so a user-supplied endpoint could delete another user's subscription.
    //   With RLS, users can only delete their own subscriptions (enforced by row-level policy).
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);

    if (error) {
      const pgError = error as { code?: string; message?: string; details?: string; hint?: string };
      logger.error('[Push Unsubscribe] DB error:', {
        code: pgError.code,
        message: pgError.message,
        details: pgError.details,
        hint: pgError.hint,
      });

      // Case 1: table does not exist (migration 121 not run)
      if (pgError.code === '42P01') {
        return NextResponse.json(
          { error: 'Push notification database table is not set up.', error_code: 'TABLE_NOT_FOUND' },
          { status: 503 },
        );
      }

      return NextResponse.json(
        { error: pgError.message || 'Failed to remove subscription', error_code: pgError.code || 'DB_ERROR' },
        { status: 500 },
      );
    }

    logger.info(`[Push Unsubscribe] ✅ User ${user.id} unsubscribed`);

    return NextResponse.json({ success: true });
  } catch (err) {
    // safe to ignore: returns 500 to client; error is logged for debugging
    logger.error('[Push Unsubscribe] Exception:', err);
    return NextResponse.json(
      { error: 'Internal server error', error_code: 'EXCEPTION' },
      { status: 500 },
    );
  }
});
