/**
 * /api/admin/settings/env — 环境变量配置检查（需 admin 鉴权）
 *
 * GET  返回按分组的环境变量 configured 检查结果。
 *      ⛔ 绝不返回 env var 的值，只返回 configured true/false。
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { checkEnvVars } from '@/lib/admin-settings';

export async function GET(req: NextRequest) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  return withAdminAudit(req, authResult, async () => {
    const envVars = checkEnvVars();
    // 按分组聚合，便于前端直接渲染
    const groups: Record<string, typeof envVars> = {};
    for (const v of envVars) {
      (groups[v.group] ??= []).push(v);
    }
    return NextResponse.json({ envVars, groups });
  });
}
