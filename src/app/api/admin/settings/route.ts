/**
 * /api/admin/settings — 系统设置概览（需 admin 鉴权）
 *
 * GET  /api/admin/settings
 *      返回环境变量检查 + app_config 条目 + migration 数量 + cron 配置
 * POST /api/admin/settings  { action: 'health_check' }
 *      并行探测 Supabase / Letta / Embedding 连通性
 *
 * ⛔ 永不返回 env var 或敏感配置的值，只返回 configured/hasValue 布尔。
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/admin-auth';
import { withAdminAudit, logUnauthorizedAdminAttempt } from '@/lib/admin-audit';
import { createAdminClient } from '@/lib/supabase-admin';
import { checkEnvVars, getCronJobs, getMigrationsInfo, runHealthChecks } from '@/lib/admin-settings';
import { logger } from '@/lib/logger';
import type { AppConfigEntry } from '@/lib/admin-panel/types';

/** GET: 系统设置概览 */
export function GET(req: NextRequest) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  return withAdminAudit(req, authResult, async () => {
    const envVars = checkEnvVars();
    const { migrations } = await getMigrationsInfo();
    const cronJobs = await getCronJobs();

    // app_config 条目（只读，不返回 value，只返回 hasValue）
    const appConfig: AppConfigEntry[] = [];
    const { supabase } = createAdminClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('app_config')
        .select('key, value')
        .order('key', { ascending: true })
        .limit(200);
      if (error) {
        logger.warn('[Admin Settings] app_config query failed:', error.message);
      } else if (data) {
        for (const row of data) {
          appConfig.push({
            key: row.key,
            hasValue: !!row.value && row.value.trim() !== '',
            updatedAt: '', // app_config 表无 updated_at 列
          });
        }
      }
    }

    return NextResponse.json({
      envVars,
      appConfig,
      migrationCount: migrations.length,
      cronJobs,
    });
  });
}

/** POST: action=health_check — 探测各服务连通性 */
export async function POST(req: NextRequest) {
  const authResult = verifyAdminAuth(req);
  if (!authResult.authorized) {
    void logUnauthorizedAdminAttempt(req, authResult);
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  let action: string | undefined;
  try {
    const body = await req.json();
    action = body?.action;
  } catch {
    // 无 body 或非 JSON —— 继续走 action 校验
  }

  if (action !== 'health_check') {
    return NextResponse.json({ error: 'Invalid or missing action. Expected: health_check' }, { status: 400 });
  }

  return withAdminAudit(req, authResult, async () => {
    const checks = await runHealthChecks();
    // 映射为 POST 响应格式：healthy → ok，其余 → error
    const services = checks.map((c) => ({
      name: c.service,
      status: c.status === 'healthy' ? ('ok' as const) : ('error' as const),
      latency: c.latencyMs,
      ...(c.message ? { error: c.message } : {}),
    }));
    return NextResponse.json({ services });
  });
}
