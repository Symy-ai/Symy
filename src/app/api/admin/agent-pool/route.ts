/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * GET /api/admin/agent-pool — 查看池子状态
 * POST /api/admin/agent-pool — 手动触发 checkAndRefill
 *   Body (可选): { "setPoolSize": 4 } — 手动设置 pool_size
 *
 * 🔧 2026-07-15 (ARCH-2 #2 修复): 迁移到 verifyAdminAuth + withAdminAudit
 *    旧代码: 手动 timingSafeCompare, 无 audit log
 *    修复: 用共享 verifyAdminAuth + withAdminAudit (记录到 admin_audit_logs)
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { checkAndRefill, getPoolStatus } from '@/lib/letta-agent-pool';
import { createAdminClient } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// eslint-disable-next-line require-await -- withAdminAudit HOF requires async function signature
export async function GET(req: NextRequest) {
  // eslint-disable-next-line require-await -- withAdminAudit HOF is async for API compat
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return withAdminAudit(req, authResult, async () => {
    try {
      const status = await getPoolStatus();
      if (!status) {
        return NextResponse.json({ error: 'Failed to get pool status' }, { status: 500 });
      }
      return NextResponse.json({ success: true, ...status });
    } catch (err) {
      // safe to ignore: returns 500 to client
      logger.error('[Admin Agent Pool] GET error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }, 'agent-pool-get');
}

// eslint-disable-next-line require-await
export async function POST(req: NextRequest) {
// eslint-disable-next-line require-await -- withAdminAudit HOF requires async function signature
  // eslint-disable-next-line require-await -- withAdminAudit HOF is async for API compat
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return withAdminAudit(req, authResult, async () => {
    try {
      // 检查是否有 setPoolSize 参数
      // 🔧 2026-07-15 (deep audit #16): Distinguish empty body from invalid JSON
      let body: { setPoolSize?: number } = {};
      const contentLength = req.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > 0) {
        try {
          body = await req.json();
        } catch {
          return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
      }

      if (typeof body.setPoolSize === 'number' && body.setPoolSize > 0) {
        // 手动设置 pool_size
        const { supabase } = createAdminClient();
        if (supabase) {
          await supabase
            .from('letta_agent_pool_config')
            .update({ pool_size: body.setPoolSize, updated_at: new Date().toISOString() })
            .eq('id', 1);
          logger.info(`[Admin Agent Pool] Manually set pool_size=${body.setPoolSize}`);
        }
      }

      const result = await checkAndRefill();
      logger.info('[Admin Agent Pool] Manual checkAndRefill:', result);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      // safe to ignore: returns 500 to client
      logger.error('[Admin Agent Pool] POST error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }, 'agent-pool-post');
}
