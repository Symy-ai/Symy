/**
 * /api/admin/settings/health — 服务健康检查（需 admin 鉴权）
 *
 * GET  并行探测 Supabase / Letta / Embedding，每个 5s 超时（Promise.allSettled）。
 *      返回 { checks: HealthCheckResult[] }。
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { runHealthChecks } from '@/lib/admin-settings';

export function GET(req: NextRequest) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  return withAdminAudit(req, authResult, async () => {
    const checks = await runHealthChecks();
    return NextResponse.json({ checks });
  });
}
