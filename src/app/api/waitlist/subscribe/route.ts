/**
 * POST /api/waitlist/subscribe
 *
 * Public waitlist endpoint for landing page visitors.
 * No login required.
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiErrors } from '@/lib/api-errors';
import { logger } from '@/lib/logger';

const subscribeSchema = z.object({
  email: z.string().email().max(200, 'Email too long'),
});

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}***@${domain}`;
}

// ── C1: IP-based in-memory rate limiting (Map + TTL) ────────────────────────
// NOTE: Vercel serverless 函数实例冷启动时 Map 会重置，这作为基础防护已足够。
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
    // C1: rate limit
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

    const email = parsed.data.email.trim().toLowerCase();

    // 直接 REST API 调用，用 Prefer: return=minimal 避免 RLS SELECT 被拒
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      '';

    if (!supabaseUrl || !supabaseKey) {
      logger.error('[waitlist/subscribe] Supabase env vars missing');
      return apiErrors.internalError('Failed to join waitlist');
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/landing_waitlist`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ email, source: 'landing_page' }),
    });

    // 201 = 成功
    if (response.status === 201) {
      logger.info('[waitlist/subscribe] subscriber recorded', { email: maskEmail(email) });
      return NextResponse.json({ success: true });
    }

    // 409 = 重复邮箱（unique constraint）→ 静默成功
    if (response.status === 409) {
      logger.info('[waitlist/subscribe] duplicate email', { email: maskEmail(email) });
      return NextResponse.json({ success: true });
    }

    // 其他错误
    const errorBody = await response.text().catch(() => '');
    logger.error('[waitlist/subscribe] insert error', {
      status: response.status,
      body: errorBody,
      email: maskEmail(email),
    });
    return apiErrors.internalError('Failed to join waitlist');
  } catch (err) {
    // safe to ignore: error is logged and a 500 response is returned to the client
    logger.error('[waitlist/subscribe] handler error', { message: getErrorMessage(err) });
    return apiErrors.internalError('Internal server error');
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) return String((err as { message: unknown }).message);
  return String(err);
}
