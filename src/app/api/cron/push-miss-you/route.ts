/**
 * GET /api/cron/push-miss-you — 每天检查 3 天未登录用户, 发送 "Symy misses you" 推送
 *
 * 🔧 2026-07-20: 营销报告 P2 #16 — 推送通知功能 Phase 2
 *
 * 触发条件:
 * - 用户 buddy_state.last_active_at < now() - 3 days
 * - 用户有 push_subscriptions 记录
 * - 用户偏好 missYou !== false
 * - 避免重复推送: 同一用户 24 小时内只推送一次 (用 push_subscriptions.updated_at 追踪)
 *
 * 推送内容:
 * - title: "Symy"
 * - body: i18n (profile.locale 决定语言, 读不到默认 zh): zh "Symy 想你了…" / en
 *   "Symy misses you. Resist one more algorithm today." — 同时保留硬编码常量
 *   MISS_YOU_PUSH_PAYLOAD 供外部引用
 * - url: "/" (跳转首页)
 *
 * Vercel cron 配置 (vercel.json):
 *   { "path": "/api/cron/push-miss-you", "schedule": "0 9 * * *" }
 *   (每天 UTC 9:00 执行 — 美东时间早上 5 点)
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

// 推送文案走 i18n (照 i18n/request.ts 的静态 JSON import 惯例 — cron 无 request locale)
// locale 读不到时的默认: zh
const DEFAULT_PUSH_LOCALE = 'zh' as const;

const MISS_YOU_MESSAGES: Record<'zh' | 'en', { title: string; body: string }> = {
  zh: zhMessages.push.missYou,
  en: enMessages.push.missYou,
};

function resolvePushLocale(locale: unknown): 'zh' | 'en' {
  return locale === 'en' ? 'en' : DEFAULT_PUSH_LOCALE;
}

// 3 天未登录阈值
const INACTIVE_DAYS = 3;
// 24 小时内不重复推送
const COOLDOWN_HOURS = 24;

export const MISS_YOU_PUSH_PAYLOAD = {
  title: 'Symy',
  body: 'Symy misses you. Your guardian elephant kept your hours safe — come see what they became.',
  url: '/',
} as const;

export async function GET(req: NextRequest) {
  // 🔧 认证: CRON_SECRET (与 agent-pool cron 一致)
  const authHeader = req.headers.get('authorization');
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!secret || !CRON_SECRET || !timingSafeCompare(secret, CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 检查 Web Push 是否配置
  if (!isWebPushConfigured()) {
    logger.warn('[Cron Push Miss You] Web Push not configured, skipping');
    return NextResponse.json({ success: true, skipped: 'web-push-not-configured' });
  }

  try {
    const { supabase, error: adminError } = createAdminClient();
    if (!supabase || adminError) {
      logger.error('[Cron Push Miss You] Admin client not available:', adminError);
      return NextResponse.json({ error: 'Admin client not available' }, { status: 500 });
    }

    // 查询 3 天未登录 + 有 push 订阅的用户
    // 🔧 用 buddy_state.last_active_at 判断用户活跃时间
    //    避免重复推送: push_subscriptions.updated_at < now() - 24h
    //    (每次推送后会更新 updated_at, 作为"最后推送时间"的代理)
    //
    // 🔧 架构守卫: 不用 Supabase 关联查询 (buddy_state!inner), 改为两步查询
    //    原因: 架构守卫测试会验证 .select() 的列名, 关联查询语法会被误判
    const threeDaysAgo = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const oneDayAgo = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();

    // Step 1: 查询 24 小时内未推送过的订阅 (避免重复推送)
    // 🔧 batch60-b: 补读 preferences — missYou 是日常通道, 用户级早停按设备行过滤
    //   (missYou=false 或 frequency=weekly/off 的行不产生候选), sender 设备级终门同语义
    const { data: recentSubscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('user_id, updated_at, preferences')
      .lt('updated_at', oneDayAgo)
      .limit(100); // 每次最多处理 100 个用户, 避免 Vercel 60s 超时

    if (subError) {
      logger.error('[Cron Push Miss You] Subscription query error:', subError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    // 偏好过滤 (按行) + 多设备去重: 任一设备行放行, 该用户即候选
    const candidateRows = (recentSubscriptions || []).filter(
      (s: { user_id: string; preferences: unknown }) =>
        isPushChannelEnabled(normalizePushPreferences(s.preferences), 'missYou'),
    );

    if (candidateRows.length === 0) {
      logger.info('[Cron Push Miss You] No users to notify (all recently notified or opted out)');
      return NextResponse.json({ success: true, notified: 0 });
    }

    // Step 2: 查询这些用户的 buddy_state.last_active_at, 过滤出 3 天未登录的
    const candidateUserIds = [...new Set(candidateRows.map((s: { user_id: string }) => s.user_id))];
    const { data: inactiveBuddyStates, error: buddyError } = await supabase
      .from('buddy_state')
      .select('user_id, last_active_at')
      .in('user_id', candidateUserIds)
      .lt('last_active_at', threeDaysAgo);

    if (buddyError) {
      logger.error('[Cron Push Miss You] Buddy state query error:', buddyError);
      return NextResponse.json({ error: 'Query failed' }, { status: 500 });
    }

    if (!inactiveBuddyStates || inactiveBuddyStates.length === 0) {
      logger.info('[Cron Push Miss You] No inactive users to notify');
      return NextResponse.json({ success: true, notified: 0 });
    }

    const userIds = inactiveBuddyStates.map((b: { user_id: string }) => b.user_id);

    logger.info(`[Cron Push Miss You] Found ${userIds.length} inactive users to notify`);

    // Step 3: 读推送 locale (profile.locale, 读不到默认 zh) — 文案语言逐用户决定
    // 同时保留硬编码常量 MISS_YOU_PUSH_PAYLOAD（供外部引用）
    const localeByUser = new Map<string, 'zh' | 'en'>();
    const { data: profileRows, error: localeError } = await supabase
      .from('profiles')
      .select('id, locale')
      .in('id', userIds);

    if (localeError) {
      // locale 读取失败不阻断推送 — 全部走默认 zh (best-effort)
      logger.warn('[Cron Push Miss You] Locale query failed, defaulting all to zh:', localeError);
    } else {
      for (const row of (profileRows || []) as { id: string; locale: string | null }[]) {
        localeByUser.set(row.id, resolvePushLocale(row.locale));
      }
    }

    // 发送推送 (payload 逐用户组装 — 文案随 locale)
    let totalSent = 0;
    let totalFailed = 0;
    let totalRemoved = 0;

    for (const userId of userIds) {
      const locale = localeByUser.get(userId) ?? DEFAULT_PUSH_LOCALE;
      const { title, body } = MISS_YOU_MESSAGES[locale];
      const payload = { title, body, url: '/' };

      const result = await sendPushToUser(userId, payload);
      totalSent += result.sent;
      totalFailed += result.failed;
      totalRemoved += result.removed;

      // 更新 push_subscriptions.updated_at 作为"最后推送时间"
      // (避免 24 小时内重复推送)
      try {
        await supabase
          .from('push_subscriptions')
          .update({ updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      } catch (updateErr) {
        // safe to ignore: updated_at update is best-effort (avoid duplicate push), failure just means possible duplicate push next run
        logger.warn(`[Cron Push Miss You] Failed to update updated_at for user ${userId}:`, updateErr);
      }
    }

    logger.info(`[Cron Push Miss You] ✅ Done. Sent: ${totalSent}, Failed: ${totalFailed}, Removed: ${totalRemoved}`);

    return NextResponse.json({
      success: true,
      notified: userIds.length,
      sent: totalSent,
      failed: totalFailed,
      removed: totalRemoved,
    });
  } catch (err) {
    // safe to ignore: log error, return 500
    logger.error('[Cron Push Miss You] Exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
