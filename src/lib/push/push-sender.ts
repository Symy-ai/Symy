/**
 * Push Notification Sender — 查询用户订阅 + 发送推送
 *
 * 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能 Phase 2
 *
 * 功能:
 * 1. 查询用户的 push_subscriptions
 * 2. 发送推送通知 (调用 web-push)
 * 3. 处理失败订阅 (endpoint 失效时自动删除)
 *
 * 使用:
 * import { sendPushToUser, sendPushToUsers } from '@/lib/push/push-sender';
 * await sendPushToUser(userId, { title: 'Symy', body: 'Miss you!' });
 */

import 'server-only';

import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushNotification, configureWebPush, isWebPushConfigured } from './web-push-config';
import { normalizePushPreferences, isPushChannelEnabled, type PushChannel } from './preferences';
import { logger } from '@/lib/logger';
import type { Database } from '@/lib/database.types';

type PushSubscription = Database['public']['Tables']['push_subscriptions']['Row'];

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
}

/**
 * 发送推送通知给单个用户 (所有设备)
 *
 * @param userId - 用户 ID
 * @param payload - 通知内容
 * @returns 发送结果: { sent: number, failed: number, removed: number }
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  explicitPrefKey?: PushChannel,
): Promise<{ sent: number; failed: number; removed: number }> {
  const result = { sent: 0, failed: 0, removed: 0 };

  if (!isWebPushConfigured()) {
    logger.warn('[PushSender] Web Push not configured, skipping');
    return result;
  }

  configureWebPush();

  const { supabase, error: adminError } = createAdminClient();
  if (!supabase || adminError) {
    logger.error('[PushSender] Admin client not available:', adminError);
    return result;
  }

  // 查询用户的所有订阅
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    logger.error('[PushSender] Failed to query subscriptions:', error);
    return result;
  }

  if (!subscriptions || subscriptions.length === 0) {
    return result;
  }

  // 检查用户偏好 (missYou/dreamFund/challenge/dailyAlgorithm/weeklyGuardian + 频率)
  // 🔧 Round 2 QA fix: daily_algorithm url is '/?tab=chat', needs explicit detection
  //   to avoid falling back to 'missYou' preference check
  // 🔧 batch60-b: 过滤语义收敛到 preferences.isPushChannelEnabled 单点 —
  //   设备级终门同时尊重类型开关与频率节奏 (事件通道豁免频率), 与 cron 用户级早停逐字节一致
  const prefKey: PushChannel = explicitPrefKey ?? (
    payload.url?.includes('dream-fund')
      ? 'dreamFund'
      : payload.url?.includes('challenge')
        ? 'challenge'
        : payload.url?.includes('tab=chat')
          ? 'dailyAlgorithm'
          : 'missYou'
  );

  const fullPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-72.png',
    data: { url: payload.url || '/' },
  });

  // 并行发送到所有订阅
  const sendPromises = subscriptions.map(async (sub: PushSubscription) => {
    // 检查偏好 (类型开关 + 频率节奏, 宽容归一化 — 坏行落默认不误发)
    if (!isPushChannelEnabled(normalizePushPreferences(sub.preferences), prefKey)) {
      logger.info(`[PushSender] User ${userId} opted out of ${prefKey}, skipping`);
      return;
    }

    try {
      await sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh_key,
            auth: sub.auth_key,
          },
        },
        fullPayload,
      );
      result.sent++;
    } catch (err) {
      result.failed++;
      logger.warn(`[PushSender] Failed to send to endpoint ${sub.endpoint.substring(0, 50)}...:`, err);

      // 如果是 404 (订阅失效) 或 410 (订阅过期), 删除订阅
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        try {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
          result.removed++;
          logger.info(`[PushSender] Removed expired subscription ${sub.id}`);
        } catch (deleteErr) {
          // safe to ignore: expired subscription cleanup is best-effort, will retry on next push
          logger.error('[PushSender] Failed to remove expired subscription:', deleteErr);
        }
      }
    }
  });

  await Promise.allSettled(sendPromises);

  return result;
}

/**
 * 发送推送通知给多个用户
 *
 * @param userIds - 用户 ID 数组
 * @param payload - 通知内容
 * @returns 发送结果: { sent: number, failed: number, removed: number }
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  explicitPrefKey?: PushChannel,
): Promise<{ sent: number; failed: number; removed: number }> {
  const totalResult = { sent: 0, failed: 0, removed: 0 };

  // 串行处理每个用户 (避免并发太多 web-push 请求)
  for (const userId of userIds) {
    const result = await sendPushToUser(userId, payload, explicitPrefKey);
    totalResult.sent += result.sent;
    totalResult.failed += result.failed;
    totalResult.removed += result.removed;
  }

  return totalResult;
}
