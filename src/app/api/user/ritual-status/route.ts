/**
 * GET /api/user/ritual-status — 检查是否需要显示每日守护仪式
 * POST /api/user/ritual-status — 标记仪式已查看
 *
 * 数据持久化: profiles.last_ritual_at (migration 055)
 * 跨设备同步: 用户在设备 A 看过 → 设备 B 不会重复显示
 *
 * 🔧 2026-07-15: 从测试期 5 分钟间隔改为每日 1 次 (UTC 4:00 AM 为分界)
 *   用户反馈: "每次进 Buddy 都弹" → 实际是 5 分钟间隔导致频繁触发
 *   修复: 用 getLimitWindow() 计算今日窗口, last_ritual_at 不在今日窗口内才显示
 *   效果: 每天最多弹 1 次, 用户当天关闭后不再弹出 (相当于 "Don't show again today")
 *
 * 🔧 Round 110: Migrated to withAuth HOF
 */

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getLimitWindow } from '@/lib/limit-window';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ supabase, user }) => {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('last_ritual_at')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      // 🔧 2026-07-15: Remove migration-era fallback — last_ritual_at column
      // has been deployed for months. Returning shouldShow:true on DB error
      // causes ritual popup to loop every 5 min during DB outages.
      logger.error('[Ritual Status] Profile fetch failed:', profileError.message);
      return NextResponse.json({ error: 'Failed to fetch ritual status' }, { status: 500 });
    }

    // 🔧 2026-07-15: 每日 1 次逻辑 — 用 getLimitWindow() 判断 last_ritual_at 是否在今日窗口内
    //   旧代码: RITUAL_INTERVAL_MS = 5 分钟 → 每 5 分钟弹 1 次, 用户烦
    //   新代码: 比较 last_ritual_at 的日期窗口与当前日期窗口, 不同则 shouldShow=true
    //   效果: 每天最多弹 1 次 (UTC 4:00 AM 重置, 与 Gacha/Challenge 限制窗口一致)
    const todayWindow = getLimitWindow();
    const lastRitualWindow = profile?.last_ritual_at
      ? getLimitWindow(new Date(profile.last_ritual_at))
      : null;
    const shouldShow = lastRitualWindow !== todayWindow;

    return NextResponse.json({
      shouldShow,
      lastRitualAt: profile?.last_ritual_at || null,
      intervalMs: 24 * 60 * 60 * 1000, // 24h (用于前端显示, 实际用窗口判断)
    });
  } catch (err) {
    // safe to ignore: non-critical error, logged for observability
    logger.error('[Ritual Status] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

export const POST = withAuth(async ({ supabase, user }) => {
  try {
    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ last_ritual_at: now, updated_at: now })
      .eq('id', user.id);

    if (updateError) {
      // 🔧 2026-07-15 (ARCH-5 #4 修复): DB 失败时返回 success: false (was success: true)
      //    旧代码: DB error 仍返回 success: true → 客户端以为仪式已标记, 实际没存
      //    → 下次 GET 仍返回 shouldShow: true, 但客户端已不显示 (状态不一致)
      //    修复: 返回 500, 客户端可重试
      logger.error('[Ritual Status] Failed to update last_ritual_at:', updateError.message);
      return NextResponse.json(
        { error: 'Failed to mark ritual as shown', success: false },
        { status: 500 }
      );
    }

    logger.info(`[Ritual Status] Marked ritual as shown for user ${user.id.substring(0, 8)}`);
    return NextResponse.json({ success: true, lastRitualAt: now });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Ritual Status] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
});
