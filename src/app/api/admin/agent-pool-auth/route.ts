/**
 * GET /api/admin/agent-pool-auth — 查看池子状态 (Supabase auth 认证)
 * POST /api/admin/agent-pool-auth — 手动触发 checkAndRefill
 *
 * ADMIN_API_KEY 未配置时的 fallback 路由
 * 用 Supabase auth session + 邮箱白名单认证
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { checkAndRefill, getPoolStatus } from '@/lib/letta-agent-pool';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// 🔧 Round 128 AUDIT-11 BUG #1: 删除硬编码 admin 邮箱后门 (与 Round 120 AUDIT-5 S3 同类漏洞)

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_req: NextRequest) {
  try {
    // 🔧 Round 128 AUDIT-11 BUG #1: 强制要求 ADMIN_EMAILS (fail-closed)
    if (ADMIN_EMAILS.length === 0) {
      logger.error('[Admin Agent Pool Auth] ADMIN_EMAILS env var not configured — refusing to authenticate (fail-closed).');
      return NextResponse.json({ error: 'Admin email whitelist not configured.' }, { status: 503 });
    }

    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized — must be logged in' }, { status: 401 });
    }

    // 🔧 Round 128 AUDIT-11 BUG #2: timing-safe 邮箱比较 (防 timing attack)
    const email = user.email?.toLowerCase() || '';
    const isAuthorized = ADMIN_EMAILS.some(allowed => {
      if (email.length !== allowed.length) return false;
      let diff = 0;
      for (let i = 0; i < email.length; i++) {
        diff |= email.charCodeAt(i) ^ allowed.charCodeAt(i);
      }
      return diff === 0;
    });
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
    }

    const status = await getPoolStatus();
    if (!status) {
      return NextResponse.json({ error: 'Failed to get pool status' }, { status: 500 });
    }
    return NextResponse.json({ success: true, triggeredBy: email, ...status });
  } catch (err) {
    // safe to ignore: top-level catch returns 500 to client, error is logged
    logger.error('[Admin Agent Pool Auth] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    // 🔧 Round 128 AUDIT-11 BUG #1: 强制要求 ADMIN_EMAILS (fail-closed)
    if (ADMIN_EMAILS.length === 0) {
      logger.error('[Admin Agent Pool Auth] ADMIN_EMAILS env var not configured — refusing to authenticate (fail-closed).');
      return NextResponse.json({ error: 'Admin email whitelist not configured.' }, { status: 503 });
    }

    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    });

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized — must be logged in' }, { status: 401 });
    }

    // 🔧 Round 128 AUDIT-11 BUG #2: timing-safe 邮箱比较 (防 timing attack)
    const email = user.email?.toLowerCase() || '';
    const isAuthorized = ADMIN_EMAILS.some(allowed => {
      if (email.length !== allowed.length) return false;
      let diff = 0;
      for (let i = 0; i < email.length; i++) {
        diff |= email.charCodeAt(i) ^ allowed.charCodeAt(i);
      }
      return diff === 0;
    });
    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
    }

    const result = await checkAndRefill();
    logger.info(`[Admin Agent Pool Auth] Manual checkAndRefill by ${email}:`, result);
    return NextResponse.json({ success: true, triggeredBy: email, ...result });
  } catch (err) {
    // safe to ignore: top-level catch returns 500 to client, error is logged
    logger.error('[Admin Agent Pool Auth] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
