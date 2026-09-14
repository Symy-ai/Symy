/**
 * GET /api/cron/push-weekly-guardian — 每周一上午推送"守护周报"战报 (batch27-c)
 *
 * 荣誉数字触达沉默大多数: Symy 的核心荣誉数字"赢回 X 小时"原本只活在
 * 用户主动打开的周报页里; 本 route 把它送到锁屏 — "本周守护 X 笔 · 赢回 Y 小时"。
 *
 * 口径红线:
 * - 数字全部来自真实拦截台账 (health_events 的 challenge_reward + deposit_api 审计记录,
 *   经 guard-ledger.deriveGuardTransfers 派生 — 不新写聚合逻辑) — 真实战报, 非营销话术。
 * - 小时数 = 真实省钱 ÷ 用户真实时薪 (getUserHourlyRate, hourly_rate ?? DEFAULT_HOURLY_RATE)。
 * - 推送文案零金额 (金额只在私人视图铁律外推到推送面) — 战报只谈笔数 + 时间。
 * - 禁碳足迹具体数值。
 * - 零战报不推 (当周守护笔数为 0 的用户不推 — 荣誉框架非羞辱, 不发空文案)。
 * - 一周只推一次 (照 push-miss-you 的 push_subscriptions.updated_at 冷却过滤模式)。
 * - 文案走 i18n 不硬编码: zh/en 由 profile.locale 决定, 读不到默认 zh。
 *
 * 触发条件:
 * - 用户有 push_subscriptions 记录, 且 7 天内未被推送过 (updated_at 冷却)
 * - 用户 weeklyGuardian 偏好开启, 且 frequency !== 'off' (batch60-b 偏好中心)
 * - 用户近 7 天有守护台账条目 (health_events challenge_reward 派生 > 0 笔)
 *
 * 推送内容:
 * - title: "本周守护 6 笔 · 赢回 12 小时" (小时形态; 不足 1 小时走分钟形态,
 *   避免"赢回 0 小时"的零荣誉羞辱)
 * - body: 战报插值 ({count}/{hours})
 * - url: "/{locale}" (直达 app 首页, tab 导航已有周报入口)
 *
 * Vercel cron 配置 (vercel.json):
 *   { "path": "/api/cron/push-weekly-guardian", "schedule": "0 1 * * 1" }
 *   (每周一 UTC 01:00 = 亚洲/Shanghai 周一 09:00)
 *
 * 认证: CRON_SECRET (Vercel Cron 标准)
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { timingSafeCompare } from '@/lib/timing-safe-compare';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendPushToUsers } from '@/lib/push/push-sender';
import { isWebPushConfigured } from '@/lib/push/web-push-config';
import { deriveGuardTransfers, guardTransfersTotal, type GuardEventLite } from '@/lib/guard-ledger';
import { getUserHourlyRate } from '@/lib/user-hourly-rate';
import { normalizePushPreferences, isPushChannelEnabled } from '@/lib/push/preferences';
import enMessages from '@/i18n/messages/en.json';
import zhMessages from '@/i18n/messages/zh.json';

const CRON_SECRET = process.env.CRON_SECRET;

// 近 7 天守护台账 = "当周"战报窗口
const WINDOW_DAYS = 7;
// 一周只推一次: 7 天冷却 (push_subscriptions.updated_at 作"最后推送时间"代理)
const COOLDOWN_DAYS = 7;
// 每次最多处理 100 个用户, 避免 Vercel 60s 超时 (同 push-miss-you)
const MAX_USERS = 100;
// 推送 locale 读不到时的默认 (推送面 zh 优先)
const DEFAULT_PUSH_LOCALE = 'zh' as const;

interface WeeklyGuardianMessages {
  titleHours: string;
  titleMinutes: string;
  body: string;
}

// 服务端推送文案读取: 照 i18n/request.ts 的静态 JSON import 惯例
// (push 域无 getMessages 先例, cron 无 request locale, 不发明新机制)
const PUSH_MESSAGES: Record<'zh' | 'en', WeeklyGuardianMessages> = {
  zh: zhMessages.push.weeklyGuardian,
  en: enMessages.push.weeklyGuardian,
};

/** health_events 行的最小字段 (snake_case, 只取派生所需真实列) */
interface GuardEventRow {
  id: string;
  user_id: string;
  event_type: string;
  trigger_source: string;
  trigger_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function toGuardEventLite(row: GuardEventRow): GuardEventLite {
  return {
    id: row.id,
    eventType: row.event_type,
    triggerSource: row.trigger_source,
    triggerId: row.trigger_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

/** locale 归一: 只有显式 'en' 走英文, 其余 (null/未知) 默认 zh */
function resolvePushLocale(locale: unknown): 'zh' | 'en' {
  return locale === 'en' ? 'en' : DEFAULT_PUSH_LOCALE;
}

/** {count}/{hours}/{minutes} 简单插值 (同既有 messages 的变量风格) */
function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/**
 * 战报文案组装 — 两种形态:
 * - ≥1 小时: "赢回 X 小时" (一位小数, 整数去掉 .0)
 * - <1 小时: "赢回 Y 分钟" (分钟形态 — 避免"赢回 0 小时")
 */
export function buildWeeklyGuardianCopy(
  locale: 'zh' | 'en',
  count: number,
  hours: number,
): { title: string; body: string } {
  const msg = PUSH_MESSAGES[locale];
  const hoursRounded = Math.round(hours * 10) / 10;
  const hoursDisplay = Number.isInteger(hoursRounded) ? String(hoursRounded) : hoursRounded.toFixed(1);
  const minutesDisplay = Math.max(1, Math.round(hours * 60));

  const title =
    hoursRounded >= 1
      ? interpolate(msg.titleHours, { count, hours: hoursDisplay })
      : interpolate(msg.titleMinutes, { count, minutes: minutesDisplay });
  const body = interpolate(msg.body, { count, hours: hoursDisplay });

  return { title, body };
}

export async function GET(req: NextRequest) {
  // 🔧 认证: CRON_SECRET (与 push-miss-you 逐字节对齐)
  const authHeader = req.headers.get('authorization');
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!secret || !CRON_SECRET || !timingSafeCompare(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 检查 Web Push 是否配置
  if (!isWebPushConfigured()) {
    logger.warn('[Cron Push Weekly Guardian] Web Push not configured, skipping');
    return NextResponse.json({ success: true, skipped: 'web-push-not-configured' });
  }

  try {
    const { supabase, error: adminError } = createAdminClient();
    if (!supabase || adminError) {
      logger.error('[Cron Push Weekly Guardian] Admin client not available:', adminError);
      return NextResponse.json({ error: 'Admin client not available' }, { status: 500 });
    }

    const now = Date.now();
    const weekAgo = new Date(now - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const cooldownAgo = new Date(now - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Step 1: 查询 7 天内未推送过的订阅 (一周只推一次)
    // 🔧 用 push_subscriptions.updated_at 作"最后推送时间"代理 (同 push-miss-you)
    // 🔧 架构守卫: 不用关联查询, 两步走 (列名守卫只认简单列名)
    // 🔧 batch60-b: 补读 preferences — weeklyGuardian 通道 frequency='off' 不发,
    //   daily/weekly 节奏都发 (存量默认频率不回退 batch27-c 沉默大多数触达), 按设备行过滤
    const { data: recentSubscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('user_id, updated_at, preferences')
      .lt('updated_at', cooldownAgo)
      .limit(MAX_USERS);

    if (subError) {
      logger.error('[Cron Push Weekly Guardian] Subscription query error:', subError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // 偏好过滤 (按行) + 多设备去重: 任一设备行放行, 该用户即候选
    const candidateRows = (recentSubscriptions || []).filter(
      (s: { user_id: string; preferences: unknown }) =>
        isPushChannelEnabled(normalizePushPreferences(s.preferences), 'weeklyGuardian'),
    );

    if (candidateRows.length === 0) {
      logger.info('[Cron Push Weekly Guardian] No users to notify (all recently notified or opted out)');
      return NextResponse.json({ success: true, notified: 0 });
    }

    const candidateUserIds = [...new Set(candidateRows.map((s: { user_id: string }) => s.user_id))];

    // Step 2: 拉这些用户近 7 天的守护台账审计记录 (challenge_reward),
    //         派生交给 guard-ledger.deriveGuardTransfers (不新写聚合逻辑)
    const { data: guardEventRows, error: eventsError } = await supabase
      .from('health_events')
      .select('user_id, id, event_type, trigger_source, trigger_id, metadata, created_at')
      .in('user_id', candidateUserIds)
      .eq('event_type', 'challenge_reward')
      .gte('created_at', weekAgo);

    if (eventsError) {
      logger.error('[Cron Push Weekly Guardian] Guard events query error:', eventsError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // Step 3: 按用户聚合战报 — 零战报不推 (荣誉框架非羞辱)
    const eventsByUser = new Map<string, GuardEventLite[]>();
    for (const row of (guardEventRows || []) as GuardEventRow[]) {
      const list = eventsByUser.get(row.user_id) || [];
      list.push(toGuardEventLite(row));
      eventsByUser.set(row.user_id, list);
    }

    const reportByUser = new Map<string, { count: number; total: number }>();
    for (const userId of candidateUserIds) {
      const entries = deriveGuardTransfers(eventsByUser.get(userId));
      if (entries.length === 0) continue; // 零战报不推
      reportByUser.set(userId, { count: entries.length, total: guardTransfersTotal(entries) });
    }

    if (reportByUser.size === 0) {
      logger.info('[Cron Push Weekly Guardian] No users with guard activity this week');
      return NextResponse.json({ success: true, notified: 0 });
    }

    const activeUserIds = [...reportByUser.keys()];
    logger.info(`[Cron Push Weekly Guardian] Found ${activeUserIds.length} users with weekly guard reports`);

    // Step 4: 读推送 locale (profile.locale, 读不到默认 zh)
    const localeByUser = new Map<string, 'zh' | 'en'>();
    const { data: profileRows, error: localeError } = await supabase
      .from('profiles')
      .select('id, locale')
      .in('id', activeUserIds);

    if (localeError) {
      // locale 读取失败不阻断推送 — 全部走默认 zh (best-effort)
      logger.warn('[Cron Push Weekly Guardian] Locale query failed, defaulting all to zh:', localeError);
    } else {
      for (const row of (profileRows || []) as { id: string; locale: string | null }[]) {
        localeByUser.set(row.id, resolvePushLocale(row.locale));
      }
    }

    // 发送推送 (payload 逐用户组装: locale + 真实时薪换算)
    let totalSent = 0;
    let totalFailed = 0;
    let totalRemoved = 0;

    for (const userId of activeUserIds) {
      const report = reportByUser.get(userId)!;
      const locale = localeByUser.get(userId) ?? DEFAULT_PUSH_LOCALE;
      const rate = await getUserHourlyRate(userId);
      const hours = rate > 0 ? report.total / rate : 0;
      const { title, body } = buildWeeklyGuardianCopy(locale, report.count, hours);

      const payload = { title, body, url: `/${locale}` };
      const result = await sendPushToUsers([userId], payload, 'weeklyGuardian');
      totalSent += result.sent;
      totalFailed += result.failed;
      totalRemoved += result.removed;

      // 更新 push_subscriptions.updated_at 作为"最后推送时间" (一周冷却的代理)
      try {
        await supabase
          .from('push_subscriptions')
          .update({ updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } catch (updateErr) {
        // safe to ignore: updated_at update is best-effort (avoid duplicate push), failure just means possible duplicate push next run
        logger.warn(`[Cron Push Weekly Guardian] Failed to update updated_at for user ${userId}:`, updateErr);
      }
    }

    logger.info(`[Cron Push Weekly Guardian] ✅ Done. Sent: ${totalSent}, Failed: ${totalFailed}, Removed: ${totalRemoved}`);

    return NextResponse.json({
      success: true,
      notified: activeUserIds.length,
      sent: totalSent,
      failed: totalFailed,
      removed: totalRemoved,
    });
  } catch (err) {
    // safe to ignore: log error, return 500
    logger.error('[Cron Push Weekly Guardian] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
