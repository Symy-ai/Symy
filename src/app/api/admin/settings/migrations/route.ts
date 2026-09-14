/**
 * /api/admin/settings/migrations — Migration 文件状态（需 admin 鉴权）
 *
 * GET  列出 supabase/migrations/ 下所有 .sql 文件 + 大小，检测编号冲突。
 *      ⛔ 只读，绝不执行任何 migration。
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { getMigrationsInfo } from '@/lib/admin-settings';

export async function GET(req: NextRequest) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  return withAdminAudit(req, authResult, async () => {
    const overview = await getMigrationsInfo();
    return NextResponse.json(overview);
  });
}
