/**
 * /api/admin/audit — Admin 操作审计日志查看 API（需 admin 鉴权）
 *
 * 🔧 ARCH fix (Round 22 BUG-R22-H6 — admin_audit_logs 表写而不读):
 *    Round 13 BUG-14 创建了审计表 + withAdminAudit helper, 但没创建 admin 查看审计日志的 API。
 *    多 admin 协作时无法查看谁做了什么操作, 暴力破解尝试记录在表中但无人查看。
 *    根因修复: 创建此 GET 路由, admin 可分页查询审计日志。
 *
 * GET /api/admin/audit?page=1&limit=50&route=xxx&actor=xxx
 *   返回审计日志列表 (按 created_at desc 排序, 支持分页 + 过滤)
 *
 * GET /api/admin/audit?action=stats
 *   返回审计日志统计 (总数 + 按 action 分组)
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

// 🔧 ARCH fix (Round 21 BUG-R21-H4): admin batch 操作缺 maxDuration
export const maxDuration = 60;

  // eslint-disable-next-line require-await -- async for API consistency
export async function GET(req: NextRequest) {
  // 🔒 SEC-CRITICAL fix: verifyAdminAuth 返回对象（始终 truthy），旧代码鉴权绕过。
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  return withAdminAudit(req, authResult, async () => {
    try {
      const { supabase } = createAdminClient();
      if (!supabase) {
        return NextResponse.json({ error: 'Admin client not configured' }, { status: 500 });
      }

      const url = new URL(req.url);
      const action = url.searchParams.get('action');
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
      const routeFilter = url.searchParams.get('route');
      const actorFilter = url.searchParams.get('actor');
      const offset = (page - 1) * limit;

      // Stats mode: 返回按 action 分组的统计
      // 🔧 ARCH fix Round 75 (Finding 32): 旧代码 .limit(10000) 静默截断 —
      //    超过 10000 条日志时 total/byAction/byStatus 全部错误.
      //    根因修复: (1) 用 count:'exact', head:true 获取真实总数;
      //    (2) byAction/byStatus 仍用 row fetch (PostgREST 无 GROUP BY),
      //    但 limit 提高到 100000 并加 truncation 警告.
      if (action === 'stats') {
        // Get exact total count (no row fetch)
        const { count: exactTotal, error: countError } = await supabase
          .from('admin_audit_logs')
          .select('*', { count: 'exact', head: true });

        if (countError) {
          logger.error('[Admin Audit API] Count query failed:', countError.message);
          return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
        }

        // Fetch rows for byAction/byStatus breakdown (PostgREST has no GROUP BY)
        const STATS_ROW_LIMIT = 100_000; // 🔧 Round 75: 10k → 100k (covers most deployments)
        const { data: stats, error: statsError } = await supabase
          .from('admin_audit_logs')
          .select('action, status_code')
          .order('created_at', { ascending: false })
          .limit(STATS_ROW_LIMIT);

        if (statsError) {
          logger.error('[Admin Audit API] Stats query failed:', statsError.message);
          return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
        }

        const byAction: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        let rowsProcessed = 0;
        for (const row of (stats || []) as Array<{ action: string | null; status_code: number }>) {
          const act = row.action || '(none)';
          byAction[act] = (byAction[act] || 0) + 1;
          const sc = String(row.status_code);
          byStatus[sc] = (byStatus[sc] || 0) + 1;
          rowsProcessed++;
        }

        // 🔧 ARCH fix Round 75: Warn if rows were truncated (byAction/byStatus may be incomplete)
        const truncated = (exactTotal ?? 0) > rowsProcessed;
        if (truncated) {
          logger.warn(`[Admin Audit API] Stats truncated: ${rowsProcessed}/${exactTotal} rows processed — byAction/byStatus may be incomplete`);
        }

        return NextResponse.json({
          total: exactTotal ?? 0, // 🔧 Round 75: exact count (not capped at row limit)
          byAction,
          byStatus,
          truncated, // 🔧 Round 75: let client know if breakdown is incomplete
        });
      }

      // List mode: 分页查询审计日志
      let query = supabase
        .from('admin_audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (routeFilter) {
        query = query.eq('route', routeFilter);
      }
      if (actorFilter) {
        query = query.eq('actor', actorFilter);
      }

      const { data: logs, error: queryError, count } = await query;

      if (queryError) {
        logger.error('[Admin Audit API] Query failed:', queryError.message);
        return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
      }

      return NextResponse.json({
        logs: logs || [],
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      });
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
                    // safe to ignore: non-critical background operation, error already logged
      logger.error('[Admin Audit API] Unexpected error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  });
}
