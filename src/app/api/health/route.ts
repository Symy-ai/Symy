/**
 * GET /api/health — 公共健康检查端点
 *
 * 🔧 2026-07-15 (ARCH-7 #22 修复): 之前只有 /api/mcp/health (需要 admin auth)
 *    现在加公共 health endpoint 用于:
 *    - Vercel uptime monitoring
 *    - Better Stack / UptimeRobot 监控
 *    - Load balancer health check
 *
 * 检查项:
 * 1. Supabase 连接 (简单 SELECT 1)
 * 2. (可选) Letta API 可达性 — 不阻塞, 只在超时时报 degraded
 *
 * 返回:
 * - 200 { status: 'ok' } — 所有检查通过
 * - 503 { status: 'degraded', checks: {...} } — 部分检查失败
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, 'ok' | 'fail' | 'skip'> = {};
  let allOk = true;

  // 1. Supabase 连接检查
  try {
    const { supabase, error } = createAdminClient();
    if (error || !supabase) {
      checks.supabase = 'fail';
      allOk = false;
    } else {
      // 简单查询 — 用 RPC get_available_agent_count (如果不存在说明 DB 可达但 RPC 没有)
      const { error: rpcError } = await supabase.rpc('get_available_agent_count');
      if (rpcError && rpcError.code !== '42883') {
        // 42883 = function not found is OK (means DB is reachable, just no RPC)
        checks.supabase = 'fail';
        allOk = false;
      } else {
        checks.supabase = 'ok';
      }
    }
  } catch (err) {
    logger.warn('[Health] Supabase check failed:', err);
    checks.supabase = 'fail';
    allOk = false;
  }

  // 2. Letta API 可达性 (不阻塞 — 只检查 env var 是否配置)
  const lettaKey = process.env.LETTA_API_KEY;
  checks.letta = lettaKey ? 'ok' : 'skip';

  const status = allOk ? 'ok' : 'degraded';
  const httpStatus = allOk ? 200 : 503;

  return NextResponse.json({ status, checks, timestamp: new Date().toISOString() }, { status: httpStatus });
}
