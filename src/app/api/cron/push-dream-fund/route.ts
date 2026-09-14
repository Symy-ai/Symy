/**
 * GET /api/cron/push-dream-fund — 每天检查 Dream Fund 进度, 发送里程碑推送
 *
 * 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能 Phase 3
 *
 * 触发条件:
 * - 用户的 Dream Fund 进度达到 50%、80%、100% 里程碑
 * - 用户有 push_subscriptions 记录
 * - 用户偏好 dreamFund !== false
 * - 该里程碑未被通知过 (push_notification_log 记录)
 *
 * 推送内容:
 * - 50%: 强调被守护的钱正转化为 {fund_name} 的时间
 * - 80%: 陪伴用户走完最后一段守护旅程
 * - 100%: 汇报 {fund_name} 达成，以及被守护下来的钱/时间
 *
 * Vercel cron 配置 (vercel.json):
 *   { "path": "/api/cron/push-dream-fund", "schedule": "0 10 * * *" }
 *   (每天 UTC 10:00 执行 — 美东时间早上 6 点, miss-you 之后 1 小时)
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

// 里程碑阈值
const MILESTONES = [50, 80, 100] as const;

const DEFAULT_PUSH_LOCALE = 'zh' as const;

const DREAM_FUND_MESSAGES: Record<'zh' | 'en', typeof zhMessages.push.dreamFund> = {
  zh: zhMessages.push.dreamFund,
  en: enMessages.push.dreamFund,
};

function resolvePushLocale(locale: unknown): 'zh' | 'en' {
  return locale === 'en' ? 'en' : DEFAULT_PUSH_LOCALE;
}

export async function GET(req: NextRequest) {
  // 🔧 认证: CRON_SECRET (与 agent-pool cron 一致)
  const authHeader = req.headers.get('authorization');
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!secret || !CRON_SECRET || !timingSafeCompare(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 检查 Web Push 是否配置
  if (!isWebPushConfigured()) {
    logger.warn('[Cron Push Dream Fund] Web Push not configured, skipping');
    return NextResponse.json({ success: true, skipped: 'web-push-not-configured' });
  }

  try {
    const { supabase, error: adminError } = createAdminClient();
    if (!supabase || adminError) {
      logger.error('[Cron Push Dream Fund] Admin client not available:', adminError);
      return NextResponse.json({ error: 'Admin client not available' }, { status: 500 });
    }

    // Step 1: 查询所有有 push 订阅的用户 (去重)
    // 🔧 batch60-b: 补读 preferences — dreamFund 是事件通道, 豁免频率但必须受 dreamFund
    //   开关控制; 用户级早停按设备行过滤, sender 设备级终门同语义
    const { data: subscribedUsers, error: subError } = await supabase
      .from('push_subscriptions')
      .select('user_id, preferences')
      .limit(500); // 最多处理 500 个用户

    if (subError) {
      logger.error('[Cron Push Dream Fund] Subscription query error:', subError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!subscribedUsers || subscribedUsers.length === 0) {
      logger.info('[Cron Push Dream Fund] No users with push subscriptions');
      return NextResponse.json({ success: true, notified: 0 });
    }

    const enabledRows = subscribedUsers.filter(
      (s: { user_id: string; preferences: unknown }) =>
        isPushChannelEnabled(normalizePushPreferences(s.preferences), 'dreamFund'),
    );

    const userIds = [...new Set(enabledRows.map((s: { user_id: string }) => s.user_id))];

    if (userIds.length === 0) {
      logger.info('[Cron Push Dream Fund] All subscriptions opted out of dreamFund');
      return NextResponse.json({ success: true, notified: 0 });
    }

    // Step 2: 查询这些用户的 Dream Funds
    const { data: dreamFunds, error: fundError } = await supabase
      .from('dream_funds')
      .select('id, user_id, name, target, current, emoji')
      .in('user_id', userIds)
      .gt('target', 0); // target > 0

    if (fundError) {
      logger.error('[Cron Push Dream Fund] Dream funds query error:', fundError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!dreamFunds || dreamFunds.length === 0) {
      logger.info('[Cron Push Dream Fund] No dream funds to check');
      return NextResponse.json({ success: true, notified: 0 });
    }

    // Step 3: 读推送 locale (profile.locale, 读不到默认 zh) — best-effort, 不阻断
    const localeByUser = new Map<string, 'zh' | 'en'>();
    const { data: profileRows, error: localeError } = await supabase
      .from('profiles')
      .select('id, locale')
      .in('id', userIds);

    if (localeError) {
      logger.warn('[Cron Push Dream Fund] Locale query failed, defaulting all to zh:', localeError);
    } else {
      for (const row of (profileRows || []) as { id: string; locale: string | null }[]) {
        localeByUser.set(row.id, resolvePushLocale(row.locale));
      }
    }

    // Step 4: 查询已通知的里程碑 (避免重复推送)
    const fundIds = dreamFunds.map((f: { id: string }) => f.id);
    const { data: notifiedMilestones, error: logError } = await supabase
      .from('push_notification_log')
      .select('user_id, reference_id, milestone')
      .eq('notification_type', 'dream_fund_milestone')
      .in('reference_id', fundIds);

    if (logError) {
      logger.error('[Cron Push Dream Fund] Notification log query error:', logError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // 构建已通知集合: key = `${fundId}:${milestone}`
    const notifiedSet = new Set<string>();
    if (notifiedMilestones) {
      for (const n of notifiedMilestones) {
        if (n.reference_id && n.milestone) {
          notifiedSet.add(`${n.reference_id}:${n.milestone}`);
        }
      }
    }

    // Step 5: 检查每个 Dream Fund 的进度, 找出需要通知的里程碑
    const notificationsToSend: Array<{
      userId: string;
      fundId: string;
      fundName: string;
      milestone: number;
      payload: { title: string; body: string; url: string };
    }> = [];

    for (const fund of dreamFunds) {
      const progress = Math.round((fund.current / fund.target) * 100);

      for (const milestone of MILESTONES) {
        if (progress >= milestone) {
          const key = `${fund.id}:${milestone}`;
          if (!notifiedSet.has(key)) {
            // 需要通知
            const fundName = fund.emoji ? `${fund.emoji} ${fund.name}` : fund.name;
            const payload = getMilestonePayload(
              localeByUser.get(fund.user_id) ?? DEFAULT_PUSH_LOCALE,
              milestone,
              fundName,
            );
            notificationsToSend.push({
              userId: fund.user_id,
              fundId: fund.id,
              fundName: fund.name,
              milestone,
              payload,
            });
          }
        }
      }
    }

    if (notificationsToSend.length === 0) {
      logger.info('[Cron Push Dream Fund] No new milestones to notify');
      return NextResponse.json({ success: true, notified: 0 });
    }

    logger.info(`[Cron Push Dream Fund] Found ${notificationsToSend.length} milestone notifications to send`);

    // Step 6: 发送推送 + 记录到 push_notification_log
    let totalSent = 0;
    let totalFailed = 0;

    for (const notif of notificationsToSend) {
      // 🔧 batch60-b: 显式 dreamFund 桶 — 修 url '/' 误落 missYou 桶的旧错 (dreamFund=false
      //   而 missYou=true 的用户会被误发), sender 设备级按 dreamFund 开关终门
      const result = await sendPushToUser(notif.userId, notif.payload, 'dreamFund');
      totalSent += result.sent;
      totalFailed += result.failed;

      // 记录到 push_notification_log (无论发送成功与否, 都记录避免重试)
      // 🔧 用 upsert 避免并发重复 (UNIQUE 约束)
      try {
        await supabase
          .from('push_notification_log')
          .upsert({
            user_id: notif.userId,
            notification_type: 'dream_fund_milestone',
            reference_id: notif.fundId,
            milestone: String(notif.milestone),
            sent_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,notification_type,reference_id,milestone',
          });
      } catch (logErr) {
        // safe to ignore: log record is best-effort, failure just means possible duplicate push next run
        logger.warn(`[Cron Push Dream Fund] Failed to log notification for user ${notif.userId}, fund ${notif.fundId}, milestone ${notif.milestone}:`, logErr);
      }
    }

    logger.info(`[Cron Push Dream Fund] ✅ Done. Sent: ${totalSent}, Failed: ${totalFailed}`);

    return NextResponse.json({
      success: true,
      notified: notificationsToSend.length,
      sent: totalSent,
      failed: totalFailed,
    });
  } catch (err) {
    // safe to ignore: log error, return 500
    logger.error('[Cron Push Dream Fund] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * 根据里程碑生成推送内容（i18n 驱动，文案见 push.dreamFund）
 */
export function getMilestonePayload(
  locale: 'zh' | 'en',
  milestone: number,
  fundName: string,
): { title: string; body: string; url: string } {
  const messages = DREAM_FUND_MESSAGES[locale];
  const copy = milestone === 50
    ? { title: messages.halfwayTitle, body: messages.halfwayBody }
    : milestone === 80
      ? { title: messages.almostTitle, body: messages.almostBody }
      : milestone === 100
        ? { title: messages.fullTitle, body: messages.fullBody }
        : { title: messages.progressTitle, body: messages.progressBody };

  return {
    title: copy.title.replace('{fundName}', fundName),
    body: copy.body.replace('{fundName}', fundName),
    url: '/',
  };
}
