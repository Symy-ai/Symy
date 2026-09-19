/**
 * POST /api/transparency/subscribe
 *
 * 周报订阅 (batch84-c) — BP 0918 p20 内容引擎闭环「每周透明度报告 → 关注者 →
 * 回访」的回访钩子。公开端点, 无登录要求, 与 waitlist/subscribe 同模式:
 * IP 内存限流 + REST 直插 (Prefer: return=minimal 避开 RLS SELECT 被拒)。
 *
 * 防枚举: 重复邮箱 (unique 409) 与首次订阅返回完全相同的 200 — 不泄露谁已订阅。
 * 降级: 订阅表未建 (migration 143 未执行, PostgREST 404) → 503, 前端显示
 * 「订阅即将上线」而非报错。
 *
 * 隐私: 邮箱只入库存表, 日志一律脱敏 (maskEmail)。
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrors } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

const subscribeSchema = z.object({
  email: z.string().trim().email().max(200, 'Email too long'),
  locale: z.enum(['zh', 'en']).optional(),
});

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}***@${domain}`;
}

// IP 内存限流 — serverless 冷启动重置可接受 (与 waitlist/subscribe 同口径)
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return apiErrors.badRequest('Invalid JSON body');
    }

    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return apiErrors.badRequest('Invalid email format', parsed.error.issues);
    }

    const email = parsed.data.email.toLowerCase();
    const locale = parsed.data.locale ?? 'en';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '';

    if (!supabaseUrl || !supabaseKey) {
      logger.error('[transparency/subscribe] Supabase env vars missing');
      return apiErrors.internalError('Failed to subscribe');
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/transparency_subscribers`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email, locale }),
    });

    // 201 = 新订阅
    if (response.status === 201) {
      logger.info('[transparency/subscribe] subscriber recorded', { email: maskEmail(email), locale });
      return NextResponse.json({ success: true });
    }

    // 409 = 重复邮箱 (unique constraint) → 静默成功, 防枚举
    if (response.status === 409) {
      logger.info('[transparency/subscribe] duplicate email', { email: maskEmail(email) });
      return NextResponse.json({ success: true });
    }

    // 404 = 订阅表未建 (migration 143 未执行) → 503 即将上线
    if (response.status === 404) {
      logger.warn('[transparency/subscribe] table missing, subscription unavailable');
      return apiErrors.serviceUnavailable('Subscription not available yet');
    }

    const errorBody = await response.text().catch(() => '');
    logger.error('[transparency/subscribe] insert error', {
      status: response.status,
      body: errorBody,
      email: maskEmail(email),
    });
    return apiErrors.internalError('Failed to subscribe');
  } catch (err) {
    // safe to ignore: error is logged and a 500 response is returned to the client
    logger.error('[transparency/subscribe] handler error', { message: getErrorMessage(err) });
    return apiErrors.internalError('Internal server error');
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}
