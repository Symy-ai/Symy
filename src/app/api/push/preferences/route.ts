/**
 * GET / PATCH /api/push/preferences — 推送偏好中心 (batch60-b)
 *
 * 设置页推送偏好区的读写端点。偏好是用户级语义, 物理上仍存每行订阅的
 * preferences JSONB (零 DDL — 只读写既有列, 不新增表列):
 * - GET:    读最近更新的订阅行, 归一化成完整形状返回 (无订阅行 → 返回默认值,
 *           由前端决定展示态, 不伪造已保存)
 * - PATCH:  strict zod (未知字段 / endpoint / keys 一律拒绝) → 读存量合并 →
 *           更新该用户全部订阅行; 无订阅行返回 409 NOT_SUBSCRIBED (不伪造成功)
 *
 * 权限: withAuth (未登录 401); RLS 策略限定只能读写自己的行 (migration 121)。
 * 表缺失 (migration 121 未执行) → 503 TABLE_NOT_FOUND, 前端保留现有错误态。
 *
 * 响应:
 * - 200: { preferences } / { success: true, preferences }
 * - 400: 验证失败 (含未知字段)
 * - 401: 未登录 (handled by withAuth)
 * - 409: 无订阅行 (PATCH)
 * - 503: push_subscriptions 表未建
 */

export const dynamic = 'force-dynamic';

import { withAuth, type AuthContext } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { toJson } from '@/lib/json-helpers';
import { pushPreferencesSchema, normalizePushPreferences, type NormalizedPushPreferences } from '@/lib/push/preferences';

type AuthedSupabase = AuthContext['supabase'];

interface SubscriptionRow {
  preferences: unknown;
  updated_at: string;
}

function isTableMissing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '42P01';
}

function tableMissingResponse() {
  return NextResponse.json(
    {
      error: 'Push notification database table is not set up. Run migration 121_push_subscriptions.sql in Supabase.',
      error_code: 'TABLE_NOT_FOUND',
    },
    { status: 503 },
  );
}

/** 最近更新的订阅行代表用户级偏好 (多设备由 PATCH 全行同步保持一致) */
async function readLatestPreferences(supabase: AuthedSupabase, userId: string): Promise<{ prefs: NormalizedPushPreferences | null; error: unknown }> {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('preferences, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) return { prefs: null, error };
  const rows = (data || []) as SubscriptionRow[];
  return { prefs: rows.length > 0 ? normalizePushPreferences(rows[0].preferences) : null, error: null };
}

export const GET = withAuth(async ({ supabase, user }) => {
  try {
    const { prefs, error } = await readLatestPreferences(supabase, user.id);

    if (error) {
      if (isTableMissing(error)) return tableMissingResponse();
      logger.error('[Push Preferences] GET query error:', error);
      return NextResponse.json({ error: 'Failed to read push preferences' }, { status: 500 });
    }

    // 无订阅行 → 默认值 (前端展示态由 isSubscribed 决定, 这里只回显可编辑面)
    return NextResponse.json({ preferences: prefs ?? normalizePushPreferences(null) });
  } catch (err) {
    // safe to ignore: returns 500 to client; error is logged for debugging
    logger.error('[Push Preferences] GET exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const PATCH = withAuth(async ({ supabase, user, request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // safe to ignore: invalid JSON from client, return 400
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parseResult = pushPreferencesSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parseResult.error.issues },
      { status: 400 },
    );
  }

  try {
    const { prefs: stored, error } = await readLatestPreferences(supabase, user.id);

    if (error) {
      if (isTableMissing(error)) return tableMissingResponse();
      logger.error('[Push Preferences] PATCH query error:', error);
      return NextResponse.json({ error: 'Failed to read push preferences' }, { status: 500 });
    }

    if (!stored) {
      return NextResponse.json(
        { error: 'No active push subscription. Subscribe first, then set preferences.', error_code: 'NOT_SUBSCRIBED' },
        { status: 409 },
      );
    }

    const merged = { ...stored, ...parseResult.data };

    const { error: updateError } = await supabase
      .from('push_subscriptions')
      .update({ preferences: toJson(merged) })
      .eq('user_id', user.id);

    if (updateError) {
      if (isTableMissing(updateError)) return tableMissingResponse();
      const pgError = updateError as { code?: string; message?: string };
      logger.error('[Push Preferences] PATCH update error:', { code: pgError.code, message: pgError.message });
      return NextResponse.json(
        { error: pgError.message || 'Failed to save push preferences', error_code: pgError.code || 'DB_ERROR' },
        { status: 500 },
      );
    }

    logger.info(`[Push Preferences] ✅ User ${user.id} updated push preferences`);
    return NextResponse.json({ success: true, preferences: merged });
  } catch (err) {
    // safe to ignore: returns 500 to client; error is logged for debugging
    logger.error('[Push Preferences] PATCH exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
