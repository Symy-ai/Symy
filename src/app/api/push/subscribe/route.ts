/**
 * POST /api/push/subscribe — 订阅 Web Push 通知
 *
 * 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with 6 mergeCookies calls — now handled automatically by withAuth).
 * 🔧 batch60-b: preferences 走 pushPreferencesSchema (strict, 未知字段拒绝);
 *    先读该 endpoint 存量偏好再合并 — 重新订阅不再被默认值覆盖用户选择;
 *    校验后的偏好经 normalizePushPreferences 归一成完整形状落库。
 *
 * 请求体:
 * {
 *   subscription: PushSubscription (来自浏览器 navigator.serviceWorker.ready.pushManager.subscribe)
 *   preferences?: { missYou?, dreamFund?, challenge?, weeklyGuardian?, dailyAlgorithm?, frequency? }
 * }
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
import { toJson } from '@/lib/json-helpers';
import { pushPreferencesSchema, normalizePushPreferences } from '@/lib/push/preferences';

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  preferences: pushPreferencesSchema.optional(),
});

export const POST = withAuth(async ({ user, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // safe to ignore: invalid JSON from client, return 400
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parseResult = subscribeSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parseResult.error.issues },
      { status: 400 },
    );
  }

  const { subscription, preferences } = parseResult.data;

  try {
    // 直接使用 admin client 写入（绕过 RLS），避免 RLS 策略导致的 500 错误。
    // 安全性: user.id 已由 withAuth 验证 JWT，不存在越权风险。
    const { createAdminClient } = await import('@/lib/supabase-admin');
    const { supabase: adminClient, error: adminError } = createAdminClient();

    if (adminError || !adminClient) {
      logger.error('[Push Subscribe] Admin client not available:', adminError);
      return NextResponse.json(
        { error: 'Push notifications are not properly configured. Missing service role key.', error_code: 'ADMIN_CLIENT_MISSING' },
        { status: 500 },
      );
    }

    // 🔧 batch60-b: 先读该 (user_id, endpoint) 存量偏好再合并 —
    //   重新订阅 (body 不带 preferences) 保持用户既有选择, 不被默认值覆盖;
    //   显式传入的偏好优先。归一化后落库, 行内 JSON 形状完整。
    const { data: existingRow } = await adminClient
      .from('push_subscriptions')
      .select('preferences')
      .eq('user_id', user.id)
      .eq('endpoint', subscription.endpoint)
      .maybeSingle();

    const mergedPrefs = {
      ...normalizePushPreferences(existingRow?.preferences),
      ...preferences,
    };

    const { error: upsertError } = await adminClient
      .from('push_subscriptions')
      .upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh_key: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        preferences: toJson(mergedPrefs),
      }, {
        onConflict: 'user_id,endpoint',
      });

    if (upsertError) {
      const pgError = upsertError as { code?: string; message?: string; details?: string; hint?: string };
      logger.error('[Push Subscribe] DB error:', {
        code: pgError.code,
        message: pgError.message,
        details: pgError.details,
        hint: pgError.hint,
      });

      // Case 1: table does not exist (migration 121 not run)
      if (pgError.code === '42P01') {
        return NextResponse.json(
          {
            error: 'Push notification database table is not set up. Run migration 121_push_subscriptions.sql in Supabase.',
            error_code: 'TABLE_NOT_FOUND',
          },
          { status: 503 },
        );
      }

      // Default: DB error — include code + message for frontend diagnosis
      return NextResponse.json(
        { error: pgError.message || 'Failed to save subscription', error_code: pgError.code || 'DB_ERROR' },
        { status: 500 },
      );
    }

    logger.info(`[Push Subscribe] ✅ User ${user.id} subscribed to push notifications`);

    return NextResponse.json({ success: true });
  } catch (err) {
    // safe to ignore: returns 500 to client; error is logged for debugging
    logger.error('[Push Subscribe] Exception:', err);
    return NextResponse.json(
      { error: 'Internal server error', error_code: 'EXCEPTION' },
      { status: 500 },
    );
  }
});
