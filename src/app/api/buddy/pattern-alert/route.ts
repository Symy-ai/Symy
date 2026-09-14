/**
 * GET /api/buddy/pattern-alert — 查询 7 天内失败模式
 *
 * P1-2 失败路径 Pattern Alert (Round 90):
 *   7 天内 ≥ 2 次 challenge_failed 时, 主页 banner 提示模式
 *
 * 数据源: active_challenges 表 (status='failed'), 不用 health_events
 *   (health_events 会被 Clear 按钮清掉, 不可靠)
 *
 * 🔧 PM-#7 fix: 排除 dismissed 的记录 (用户忽略过期挑战 ≠ 看清成本仍购买)
 *   dismissChallenge 会写 metadata.dismissed=true, pattern alert 只统计真正"买了"的
 *
 * 返回: { alert: boolean, failedCount: number, recentFailures: [{itemName, amount, createdAt}] }
 *
 * 🔧 Round 102: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on 2 of 3 returns — auth cookie refresh was lost).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ supabase, user }) => {
  // 查询 active_challenges 表中 7 天内的 failed 记录
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 🔧 PM-#7 fix: 排除 dismissed 的记录
  //   旧代码: 只查 status='failed' + completed_at >= 7天前
  //   问题: dismissChallenge 也设 status='failed', 被误统计为"买了"
  //   修复: 查询后 JS 层过滤 metadata.dismissed !== true
  //   (dismiss 不设 completed_at, .gte 隐式过滤 null, 但 JS 层显式过滤更安全)
  const { data: failedChallenges, error } = await supabase
    .from('active_challenges')
    .select('item_name, amount, completed_at, created_at, metadata')
    .eq('user_id', user.id)
    .eq('status', 'failed')
    .gte('completed_at', sevenDaysAgo)
    .order('completed_at', { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch pattern data' }, { status: 500 });
  }

  // 🔧 PM-#7 fix: 在 JS 层过滤掉 dismissed 的记录 (API 层 or 过滤复杂, JS 层更可靠)
  const realFailures = (failedChallenges || []).filter(c => {
    const metadata = (c as { metadata?: Record<string, unknown> }).metadata;
    return !metadata?.dismissed;
  });

  const failedCount = realFailures.length;
  const alert = failedCount >= 2;

  const recentFailures = realFailures.map(c => ({
    itemName: (c as { item_name: string }).item_name,
    amount: Number((c as { amount: number }).amount),
    createdAt: (c as { completed_at: string; created_at: string }).completed_at || (c as { created_at: string }).created_at,
  }));

  return NextResponse.json({
    alert,
    failedCount,
    recentFailures,
  });
});
