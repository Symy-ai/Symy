/**
 * POST /api/admin/create-weekly-challenges — 手动触发创建每周社区挑战
 *
 * 🔧 2026-07-15 (ARCH-2 #3 修复): 迁移到 verifyAdminAuth + withAdminAudit
 *    旧代码: 手动 timingSafeCompare, 无 audit log
 *    修复: 用共享 verifyAdminAuth + withAdminAudit (记录到 admin_audit_logs)
 *
 * 用法:
 *   curl -X POST https://symy.ai/api/admin/create-weekly-challenges \
 *     -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
 *     -H "Content-Type: application/json" \
 *     -d '{"weekOffset": 1}'
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { createWeeklyChallengesWithFallback } from '../_lib/create-weekly-challenges-helper';

export const dynamic = 'force-dynamic';

// eslint-disable-next-line require-await -- withAdminAudit HOF requires async function signature
export async function POST(req: NextRequest) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return withAdminAudit(req, authResult, async () => { // eslint-disable-next-line require-await -- withAdminAudit HOF is async for API compat
    try {
      const { supabase, error: adminError } = createAdminClient();
      if (adminError || !supabase) {
        logger.error('[Admin] Admin client not configured:', adminError);
        // 🔧 2026-07-21 audit fix (security P2): 不回显内部配置错误 (可能泄露 env key 缺失状态)
        return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
      }

      // 解析 weekOffset (默认 0)
      // 🔧 2026-07-15 (deep audit #16): Distinguish empty body from invalid JSON
      let weekOffset = 0;
      const contentLength = req.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 0) {
        try {
          const body = await req.json();
          if (typeof body?.weekOffset === 'number' && Number.isFinite(body.weekOffset)) {
            weekOffset = Math.max(-4, Math.min(4, Math.round(body.weekOffset)));
          }
        } catch (_parseErr) {
          // safe to ignore: non-critical error, logged for observability
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
      }

      const result = await createWeeklyChallengesWithFallback(supabase, weekOffset);

      if (!result.success) {
        logger.error('[Admin] create_weekly_challenges failed:', result.error);
        // 🔧 2026-07-21 audit fix (security P2): 不回显内部错误详情 (result.error 可能含 SQL/内部状态)
        return NextResponse.json({ error: 'Failed to create challenges' }, { status: 500 });
      }

      logger.info(`[Admin] Weekly challenges created (weekOffset=${weekOffset}, fallback=${result.usedFallback})`);

      // 查询当前活跃挑战
      const { data: activeChallenges } = await supabase
        .from('community_challenges')
        .select('id, title, title_key, platform, start_date, end_date, is_active')
        .eq('is_active', true)
        .order('start_date', { ascending: false });

      return NextResponse.json({
        success: true,
        message: `Weekly challenges created successfully (weekOffset=${weekOffset}${result.usedFallback ? ', fallback' : ''})`,
        weekOffset,
        usedFallback: result.usedFallback,
        activeChallenges: activeChallenges || [],
      });
    } catch (err) {
      // safe to ignore: non-critical error, logged for observability
      logger.error('[Admin] Unexpected error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }, 'create-weekly-challenges');
}
