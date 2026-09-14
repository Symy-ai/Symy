/**
 * GET /api/challenge/active — 获取当前活跃挑战
 *
 * 🔧 BUG-003 fix: 页面刷新后恢复 activeChallenge 状态
 * 之前: 刷新后 activeChallenge=undefined, loadHistory 加载 mode=normal
 *   → 挑战消息 (mode=challenge) 不显示
 * 现在: 刷新时查活跃挑战, 如果存在则恢复 + 加载 challenge 历史
 *
 * 🔧 Round 102: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with complex mergeCookies fallback logic in catch block — withAuth handles
 *    this automatically).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getActiveChallenge } from '@/lib/challenge-store';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ user }) => {
  const result = await getActiveChallenge(user.id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    challenge: result.challenge || null,
  });
});
