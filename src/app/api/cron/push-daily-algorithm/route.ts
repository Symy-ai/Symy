/**
 * GET /api/cron/push-daily-algorithm — 每天发送一条算法操纵手法知识推送
 *
 * 🔧 2026-08-05: Push Notification Strategy — 每日算法提醒
 *
 * 触发条件:
 * - 用户有 push_subscriptions 记录
 * - 用户偏好 dailyAlgorithm !== false
 * - 当天未推送过 (push_notification_log 去重)
 *
 * 推送内容:
 * - 轮换 5 种算法手法 (Scarcity, Social Proof, Anchoring, FOMO, Personalization)
 * - 每天一种，循环；文案以守护者视角拆穿手法，并给出更绿/更省的选择方向
 *
 * Vercel cron 配置 (vercel.json):
 *   { "path": "/api/cron/push-daily-algorithm", "schedule": "30 9 * * *" }
 *   (每天 UTC 9:30 执行 — miss-you 之后 30 分钟)
 *
 * 认证: CRON_SECRET (Vercel Cron 标准)
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { timingSafeCompare } from '@/lib/timing-safe-compare';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushToUser } from '@/lib/push/push-sender';
import { isWebPushConfigured } from '@/lib/push/web-push-config';
import { normalizePushPreferences, isPushChannelEnabled } from '@/lib/push/preferences';
import enMessages from '@/i18n/messages/en.json';
import zhMessages from '@/i18n/messages/zh.json';

const CRON_SECRET = process.env.CRON_SECRET;

const DEFAULT_PUSH_LOCALE = 'zh' as const;

const DAILY_ALGORITHM_MESSAGES: Record<'zh' | 'en', typeof zhMessages.push.dailyAlgorithm> = {
  zh: zhMessages.push.dailyAlgorithm,
  en: enMessages.push.dailyAlgorithm,
};

function resolvePushLocale(locale: unknown): 'zh' | 'en' {
  return locale === 'en' ? 'en' : DEFAULT_PUSH_LOCALE;
}

// 5 种算法操纵手法，按天轮换（文案由 i18n 驱动，见 push.dailyAlgorithm）
export const ALGORITHMS = [
  { key: 'onlyThree', title: 'Symy 🎯', body: "Today's algorithm: Scarcity. \"Only 3 left!\" — that's not inventory. That's the algorithm.", url: '/?tab=chat' },
  { key: 'twelvePeople', title: 'Symy 👥', body: "Today's algorithm: Social Proof. \"12 people bought this.\" — 12 bots, or 12 humans?", url: '/?tab=chat' },
  { key: 'almost200', title: 'Symy ⚓', body: "Today's algorithm: Anchoring. $199 → $49! The $199 was never real. The $49 was always the price.", url: '/?tab=chat' },
  { key: 'saleEnds', title: 'Symy ⏰', body: "Today's algorithm: FOMO Timer. \"Sale ends in 2 hours!\" — it ends every 2 hours. That's the point.", url: '/?tab=chat' },
  { key: 'pickedForYou', title: 'Symy 🐘', body: '"Picked for you" — picked by your data, not your needs. Your guardian knows the difference.', url: '/?tab=chat' },
] as const;

// 按天轮换索引: day-of-year % 5
export function getTodayAlgorithmIndex(): number {
  const now = new Date();
  const startOfYear = new Date(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return dayOfYear % ALGORITHMS.length;
}

// 今天的日期 key (YYYY-MM-DD, UTC)
function getTodayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  // 🔧 认证: CRON_SECRET
  const authHeader = req.headers.get('authorization');
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!secret || !CRON_SECRET || !timingSafeCompare(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 检查 Web Push 是否配置
  if (!isWebPushConfigured()) {
    logger.warn('[Cron Push Daily Algorithm] Web Push not configured, skipping');
    return NextResponse.json({ success: true, skipped: 'web-push-not-configured' });
  }

  try {
    const { supabase, error: adminError } = createAdminClient();
    if (!supabase || adminError) {
      logger.error('[Cron Push Daily Algorithm] Admin client not available:', adminError);
      return NextResponse.json({ error: 'Admin client not available' }, { status: 500 });
    }

    const todayKey = getTodayDateKey();
    const algoIndex = getTodayAlgorithmIndex();
    const algorithmKey = ALGORITHMS[algoIndex].key;

    // Step 1: 查询所有有 push 订阅的用户 (按 user_id 去重，一个用户可能有多设备订阅)
    const { data: subscribedUsers, error: subError } = await supabase
      .from('push_subscriptions')
      .select('user_id, preferences')
      .limit(100); // 每次最多处理 100 个用户, 避免 Vercel 60s 超时

    if (subError) {
      logger.error('[Cron Push Daily Algorithm] Subscription query error:', subError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!subscribedUsers || subscribedUsers.length === 0) {
      logger.info('[Cron Push Daily Algorithm] No users with push subscriptions');
      return NextResponse.json({ success: true, notified: 0 });
    }

    // Step 2: 查询今天已推送过的用户 (去重)
    const { data: alreadyNotified, error: logError } = await supabase
      .from('push_notification_log')
      .select('user_id')
      .eq('notification_type', 'daily_algorithm')
      .eq('reference_id', todayKey);

    if (logError) {
      // 如果是 23514 (CHECK 约束失败) 或 42883 (函数不存在), migration 126 未执行
      const pgErr = logError as { code?: string };
      if (pgErr.code === '23514' || pgErr.code === '42883') {
        logger.warn('[Cron Push Daily Algorithm] daily_algorithm type not in CHECK constraint. Run migration 126.');
      }
      logger.error('[Cron Push Daily Algorithm] Notification log query error:', logError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    const notifiedSet = new Set<string>();
    if (alreadyNotified) {
      for (const n of alreadyNotified) {
        notifiedSet.add(n.user_id);
      }
    }

    // Step 3: 过滤需要推送的用户 (未推送过 + 偏好过滤)
    // 🔧 batch60-b: dailyAlgorithm 是日常通道 — 仅 frequency='daily' 发 (weekly/off 早停),
    //   开关与频率判定收敛到 preferences.isPushChannelEnabled 单点 (sender 设备级终门同语义)。
    // 按 user_id 去重 (一个用户可能有多设备订阅, 只推送一次)
    const seenUserIds = new Set<string>();
    const usersToNotify = subscribedUsers.filter((s: { user_id: string; preferences: unknown }) => {
      if (notifiedSet.has(s.user_id)) return false;
      if (seenUserIds.has(s.user_id)) return false; // 多设备去重
      if (!isPushChannelEnabled(normalizePushPreferences(s.preferences), 'dailyAlgorithm')) return false;
      seenUserIds.add(s.user_id);
      return true;
    });

    if (usersToNotify.length === 0) {
      logger.info('[Cron Push Daily Algorithm] No users to notify (all notified or opted out)');
      return NextResponse.json({ success: true, notified: 0 });
    }

    logger.info(`[Cron Push Daily Algorithm] Found ${usersToNotify.length} users to notify. Algorithm: ${algorithmKey}`);

    // Step 4: 读推送 locale (profile.locale, 读不到默认 zh) — best-effort, 不阻断
    const localeByUser = new Map<string, 'zh' | 'en'>();
    const { data: profileRows, error: localeError } = await supabase
      .from('profiles')
      .select('id, locale')
      .in('id', usersToNotify.map((user: { user_id: string }) => user.user_id));

    if (localeError) {
      logger.warn('[Cron Push Daily Algorithm] Locale query failed, defaulting all to zh:', localeError);
    } else {
      for (const row of (profileRows || []) as { id: string; locale: string | null }[]) {
        localeByUser.set(row.id, resolvePushLocale(row.locale));
      }
    }

    // Step 5: 发送推送 + 记录到 push_notification_log
    let totalSent = 0;
    let totalFailed = 0;

    for (const user of usersToNotify) {
      const locale = localeByUser.get(user.user_id) ?? DEFAULT_PUSH_LOCALE;
      const copy = DAILY_ALGORITHM_MESSAGES[locale][algorithmKey];
      const result = await sendPushToUser(user.user_id, { title: copy.title, body: copy.body, url: '/?tab=chat' });
      totalSent += result.sent;
      totalFailed += result.failed;

      // 记录到 push_notification_log (无论发送成功与否, 都记录避免重试)
      try {
        await supabase
          .from('push_notification_log')
          .upsert({
            user_id: user.user_id,
            notification_type: 'daily_algorithm',
            reference_id: todayKey,
            milestone: String(algoIndex), // 0-4 对应 5 种算法
            sent_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,notification_type,reference_id,milestone',
          });
      } catch {
        // safe to ignore: log record is best-effort, failure just means possible duplicate push next run
      }
    }

    logger.info(`[Cron Push Daily Algorithm] ✅ Done. Sent: ${totalSent}, Failed: ${totalFailed}`);

    return NextResponse.json({
      success: true,
      algorithm: algorithmKey,
      notified: usersToNotify.length,
      sent: totalSent,
      failed: totalFailed,
    });
  } catch (err) {
    // safe to ignore: log error, return 500
    logger.error('[Cron Push Daily Algorithm] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
