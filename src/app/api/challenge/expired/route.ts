/**
 * GET /api/challenge/expired
 * 查询用户最近的过期挑战（用于显示"恢复挑战"提醒）
 *
 * 🔧 2026-07-15: Migrated to withAuth HOF (auto cookie + Cache-Control + error handling)
 */
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getRecentExpiredChallenge } from '@/lib/challenge-store';

export const GET = withAuth(async ({ user }) => {
  const result = await getRecentExpiredChallenge(user.id);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    challenge: result.challenge || null,
  });
});
