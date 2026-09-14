/**
 * MCP Health Check API
 *
 * GET /api/mcp/health — Verify MCP infrastructure health
 *
 * Checks:
 * 1. Supabase admin client can connect
 * 2. buddy_state table is accessible
 * 3. MCP_SECRET is configured
 * 4. Letta Agent is configured (optional)
 *
 * Used for monitoring Letta AI → MCP API integration stability.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { verifyAdminAuth } from '@/lib/admin-auth';

export async function GET(request: NextRequest) {
  // 🔧 SEC-5 fix: 需要 admin 认证才能查看基础设施诊断信息
  const authResult = verifyAdminAuth(request);
  if (!authResult.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const checks: Record<string, { status: 'ok' | 'error' | 'warn'; message: string; latencyMs?: number }> = {};

  // Check 1: Environment variables
  const mcpSecret = process.env.MCP_API_SECRET;
  checks['env_mcp_secret'] = {
    status: mcpSecret ? 'ok' : 'error',
    message: mcpSecret ? 'MCP_API_SECRET is configured' : 'MCP_API_SECRET is NOT set — Letta Custom Tools will fail to authenticate',
  };

  const lettaKey = process.env.LETTA_API_KEY;
  checks['env_letta'] = {
    status: lettaKey ? 'ok' : 'warn',
    message: lettaKey
      ? 'Letta API key configured (per-user agent mode)'
      : 'Letta API key not configured — AI features unavailable',
  };

  // Check 2: Supabase admin client
  const adminStart = Date.now();
  const { supabase: adminSupabase, error: adminError } = createAdminClient();
  const adminLatency = Date.now() - adminStart;

  if (adminError || !adminSupabase) {
    checks['supabase_admin'] = {
      status: 'error',
      message: `Admin client failed: ${adminError}`,
      latencyMs: adminLatency,
    };
  } else {
    // Check 3: buddy_state table accessibility
    const tableStart = Date.now();
    try {
      const { error: tableError } = await adminSupabase
        .from('buddy_state')
        .select('user_id', { count: 'exact', head: true })
        .limit(1);

      const tableLatency = Date.now() - tableStart;

      checks['supabase_admin'] = {
        status: 'ok',
        message: 'Admin client created successfully',
        latencyMs: adminLatency,
      };

      checks['buddy_state_table'] = {
        status: tableError ? 'error' : 'ok',
        message: tableError ? `Table query failed: ${tableError.message}` : 'buddy_state table accessible',
        latencyMs: tableLatency,
      };
    } catch (err) {
      checks['buddy_state_table'] = {
        status: 'error',
        message: `Table query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Check 4: impulse_events table
    try {
      const { error: eventsError } = await adminSupabase
        .from('impulse_events')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      checks['impulse_events_table'] = {
        status: eventsError ? 'error' : 'ok',
        message: eventsError ? `Table query failed: ${eventsError.message}` : 'impulse_events table accessible',
      };
    } catch (err) {
      checks['impulse_events_table'] = {
        status: 'error',
        message: `Table query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Check 5: health_events table
    try {
      const { error: healthEventsError } = await adminSupabase
        .from('health_events')
        .select('id', { count: 'exact', head: true })
        .limit(1);

      checks['health_events_table'] = {
        status: healthEventsError ? 'error' : 'ok',
        message: healthEventsError ? `Table query failed: ${healthEventsError.message}` : 'health_events table accessible',
      };
    } catch (err) {
      checks['health_events_table'] = {
        status: 'error',
        message: `Table query threw: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Check 6: profiles table (onboarding_completed column)
    try {
      const { error: profilesError } = await adminSupabase
        .from('profiles')
        .select('onboarding_completed', { count: 'exact', head: true })
        .limit(1);

      checks['profiles_onboarding'] = {
        status: profilesError ? 'warn' : 'ok',
        message: profilesError ? `onboarding_completed column issue: ${profilesError.message}` : 'profiles.onboarding_completed accessible',
      };
    } catch (err) {
      checks['profiles_onboarding'] = {
        status: 'warn',
        message: `Column check failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Overall health
  const hasError = Object.values(checks).some(c => c.status === 'error');
  const hasWarn = Object.values(checks).some(c => c.status === 'warn');

  const overallStatus = hasError ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy';
  const httpStatus = hasError ? 503 : 200;

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
  }, { status: httpStatus });
}

