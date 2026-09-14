/**
 * POST /api/butterfly/demo-session — 创建演示会话
 * GET — 获取当前演示会话
 *
 * 不需要认证，使用内存存储
 * BUG-298 fix: 添加 IP 速率限制（10次/小时）
 */

import { createDemoSession, getDemoSession } from '@/features/butterfly/lib/demo-session-store';
import { NextRequest, NextResponse } from 'next/server';
import type { CreateSessionParams } from '@/features/butterfly/types';
import { checkRateLimit } from '@/lib/distributed-lock';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';

// BUG-298 / TECH-DEBT-A: IP 速率限制（现在用 Supabase 分布式存储）
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  // BUG-298 / TECH-DEBT-A: 分布式速率限制
  const ip = getClientIp(req);
  const { allowed } = await checkRateLimit(`demo-session:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many demo sessions. Please try again later.' },
      { status: 429 }
    );
  }

  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  // 🔧 2026-07-17 (task 1 fix): 加 'considering' 到 enum (与 session/route.ts 对齐)
  const demoSessionSchema = z.object({
    decisionType: z.enum(['bought', 'resisted', 'considering'], { message: 'decisionType must be "bought", "resisted", or "considering"' }),
    decisionDescription: z.string().trim().min(1, 'decisionDescription is required').max(500, 'decisionDescription must be a string (max 500 characters)'),
    amount: z.number().finite().min(0).max(1_000_000_000).optional(),
    platform: z.string().max(100).optional(),
    locale: z.enum(['en', 'zh']).optional(),
  }).passthrough();
  const bodyResult = await validateBody(req, demoSessionSchema);
  if (isValidationError(bodyResult)) return bodyResult;
  const body = bodyResult as CreateSessionParams;

  const session = createDemoSession(body);
  return NextResponse.json({ session });
}

  // eslint-disable-next-line require-await -- async for API consistency
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');

  if (sessionId) {
    const session = getDemoSession(sessionId);
    if (session) {
      return NextResponse.json({ session });
    }
  }

  return NextResponse.json({ session: null });
}
