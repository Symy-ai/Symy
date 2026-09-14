/**
 * GET /api/challenge/stats — 查询用户挑战统计
 *
 * P1-3 "You saw" 计数修复 (Round 90):
 *   health_events 被 Clear 后 "You saw" 变 0。
 *   修复: 从 active_challenges 表查 passed + failed 总数 (不受 Clear 影响)
 *
 * 返回: { totalSaw: number, totalPassed: number, totalFailed: number }
 *
 * 🔧 Round 102: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on 2 of 3 returns — auth cookie refresh was lost).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ supabase, user }) => {
  // 查询 active_challenges 表中 passed + failed 的总数
  const { count: passedCount, error: passedError } = await supabase
    .from('active_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'passed');

  const { count: failedCount, error: failedError } = await supabase
    .from('active_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'failed');

  if (passedError || failedError) {
    return NextResponse.json({ error: 'Failed to fetch challenge stats' }, { status: 500 });
  }

  const totalPassed = passedCount ?? 0;
  const totalFailed = failedCount ?? 0;
  const totalSaw = totalPassed + totalFailed;

  return NextResponse.json({
    totalSaw,
    totalPassed,
    totalFailed,
  });
});
