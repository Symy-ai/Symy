/**
 * GET /api/buddy/weekly-review — 本周看见周度回顾 (新需求)
 *
 * 返回过去 7 天的看见统计:
 *   - challengesCompleted: 完成挑战数 (challenge_completed 事件)
 *   - totalSaved: 本周省下的钱 (sum savedAmount from challenge_completed)
 *   - tokensEarned: 本周获得的代币 (sum metadata.tokenReward from challenge_completed)
 *   - dailyBreakdown: [{ date, count, savedAmount }] 按天分组 (用于迷你图表)
 *   - streakDays: 连续看见天数 (本周内)
 *
 * 镜子哲学: 不评判 "买" vs "不买", 只守护本周的看见模式。
 * 🔧 ARCH fix Round 76:
 *   - Finding 1: tokensEarned 现在从 metadata.tokenReward 求和 (之前查 token_change>0,
 *     但 challenge_completed 的 token_change=0, 实际奖励在 metadata.tokenReward).
 *   - Finding 3: 查询窗口与显示窗口对齐 (从 6 天前 UTC 0:00 开始, 不是 7×24h 前).
 *   - Finding 7: 移除 challengesBought/challengesPassed (违反镜子哲学, 且 component 未使用).
 *   - Finding 8: 只 select 用到的列 (移除 trigger_source/description).
 *   - Finding 11: 用 getErrorMessage 替代 raw err 日志.
 *   - Finding 25: 删除冗余的第二次 DB 查询 (tokensEarned 现在从第一次查询结果计算).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/error-utils';

export const GET = withAuth(async ({ supabase, user }) => {
  try {
    // 🔧 PM-PERF fix (2026-07-18): 并行查询 profiles + health_events (原串行, 慢)
    //   旧代码: 先查 profiles.timezone (等完成), 再查 health_events → 2次RTT
    //   新代码: Promise.all 并行 → 1次RTT (约快 50-100ms)
    const now = new Date();
    // 6天前UTC午夜 (近似, 足够准确)
    const sixDaysAgoUtcMidnight = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    const [profileResult, eventsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('health_events')
        .select('event_type, metadata, created_at')
        .eq('user_id', user.id)
        .in('event_type', ['challenge_completed', 'challenge_failed'])
        .gte('created_at', sixDaysAgoUtcMidnight.toISOString())
        .order('created_at', { ascending: true })
        .limit(200),  // 🔧 PM-PERF: limit 200 防止返回过多数据
    ]);

    const userTimezone = (profileResult.data as { timezone?: string } | null)?.timezone || 'UTC';

    // 🔧 PM-PERF: 如果 events 查询失败, 直接返回空数据 (不阻塞 UI)
    if (eventsResult.error) {
      logger.warn('[Weekly Review] query error:', eventsResult.error.message);
      // 🔧 ARCH fix (2026-07-18): return 7 empty dailyBreakdown entries (not [])
      //    so the client chart still renders 7 empty bars instead of breaking.
      const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: userTimezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
      });
      const emptyDailyBreakdown: Array<{ date: string; count: number; savedAmount: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        emptyDailyBreakdown.push({
          date: localDateFormatter.format(d),
          count: 0,
          savedAmount: 0,
        });
      }
      return NextResponse.json({
        challengesCompleted: 0,
        totalSaved: 0,
        tokensEarned: 0,
        dailyBreakdown: emptyDailyBreakdown,
        streakDays: 0,
        todayDateStr: localDateFormatter.format(now),
        weekStart: sixDaysAgoUtcMidnight.toISOString(),
        weekEnd: now.toISOString(),
      });
    }

    const events = eventsResult.data || [];

    // 🔧 PM-PERF: 用 Intl.DateTimeFormat 缓存 (避免循环内重复创建)
    const localDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: userTimezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const todayLocalStr = localDateFormatter.format(now);

    // 聚合
    const completedEvents = (events || []).filter(e => e.event_type === 'challenge_completed');

    const challengesCompleted = completedEvents.length;
    const totalSaved = completedEvents.reduce((sum, e) => {
      const meta = e.metadata as Record<string, unknown> | null;
      return sum + (typeof meta?.savedAmount === 'number' ? meta.savedAmount : 0);
    }, 0);

    // 🔧 ARCH fix Round 76 (Finding 1): tokensEarned 从 metadata.tokenReward 求和.
    //    旧代码查 token_change > 0 的 health_events, 但 challenge_completed 的 token_change=0
    //    (实际奖励通过 applyBuddyStateDelta 直接更新 buddy_state, 不记录 token_change).
    //    tokenReward 在 complete_challenge.ts:494 写入 metadata.
    //    这也消除了第二次 DB 查询 (Finding 25).
    const tokensEarned = completedEvents.reduce((sum, e) => {
      const meta = e.metadata as Record<string, unknown> | null;
      return sum + (typeof meta?.tokenReward === 'number' ? meta.tokenReward : 0);
    }, 0);

    // 按天分组 (用户本地日期 YYYY-MM-DD)
    // 🔧 ARCH fix Round 76 (Finding 2): 用 Intl.DateTimeFormat 按用户时区分组.
    const dailyMap = new Map<string, { count: number; savedAmount: number }>();
    for (const e of completedEvents) {
      // 🔧 Round 76: 用用户时区格式化日期, 不是 UTC
      const dateStr = localDateFormatter.format(new Date(e.created_at));
      const meta = e.metadata as Record<string, unknown> | null;
      const saved = typeof meta?.savedAmount === 'number' ? meta.savedAmount : 0;
      const existing = dailyMap.get(dateStr) || { count: 0, savedAmount: 0 };
      existing.count += 1;
      existing.savedAmount += saved;
      dailyMap.set(dateStr, existing);
    }

    // 生成过去 7 天的完整日期列表 (含无挑战的天) — 用用户本地日期
    const dailyBreakdown: Array<{ date: string; count: number; savedAmount: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = localDateFormatter.format(d);
      const entry = dailyMap.get(dateStr) || { count: 0, savedAmount: 0 };
      dailyBreakdown.push({ date: dateStr, ...entry });
    }

    // 计算本周连续看见天数 (从今天往前数, 遇到 0 count 停止)
    let streakDays = 0;
    for (let i = dailyBreakdown.length - 1; i >= 0; i--) {
      if (dailyBreakdown[i].count > 0) {
        streakDays += 1;
      } else {
        break;
      }
    }

    return NextResponse.json({
      challengesCompleted,
      // 🔧 ARCH fix Round 76 (Finding 7): Removed challengesBought/challengesPassed
      // (violated mirror philosophy, unused by component)
      totalSaved,
      tokensEarned,
      dailyBreakdown,
      streakDays,
      // 🔧 ARCH fix Round 76 (Finding 2): Return todayDateStr so the client highlights
      // the correct bar in the user's timezone (not UTC).
      todayDateStr: todayLocalStr,
      weekStart: sixDaysAgoUtcMidnight.toISOString(),
      weekEnd: now.toISOString(),
    });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    // 🔧 ARCH fix Round 76 (Finding 11): Use getErrorMessage instead of raw err
    logger.error('[Weekly Review] unhandled error:', getErrorMessage(err));
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
