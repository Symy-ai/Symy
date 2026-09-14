/**
 * GET /api/user/hourly-rate — 获取用户时薪
 * POST /api/user/hourly-rate — 设置用户时薪
 *
 * 时薪是全局 Freedom Translation 的计算依据:
 * 自由月数 = totalSaved / (hourlyRate × 8 × 22)
 *
 * 如果 profiles.hourly_rate 列不存在 (migration 未执行),
 * GET 返回默认值 25, POST 返回 success+warning
 *
 * 🔧 Round 105: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on 3 of 6 returns — auth cookie refresh was lost).
 */

export const maxDuration = 60;

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { syncHourlyRateToAgent } from '@/lib/letta-agent-admin';
import { validateBody, isValidationError } from '@/lib/api-validation';
// batch51-b: 默认时薪收敛到 freedom-time ($25, U-4 拍板) — 旧本地常量 $20 已过时
import { DEFAULT_HOURLY_RATE } from '@/lib/freedom-time';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async ({ supabase, user }) => {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('hourly_rate')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      // 🔧 2026-07-15: Remove migration-era fallback — hourly_rate column has been
      // deployed for months. Returning DEFAULT on DB error masks real failures
      // (RLS denial, connection drop) and shows wrong Freedom Translation.
      logger.error('[Hourly Rate] Profile fetch failed:', profileError.message);
      return NextResponse.json(
        { error: 'Failed to fetch hourly rate' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        hourlyRate: profile?.hourly_rate ?? DEFAULT_HOURLY_RATE,
        default: !profile?.hourly_rate,
        // batch26-b: DB null = 用户从未设置 (route 既有 `??` 已依赖此语义)。
        // 前端用它在「荣誉时刻」引导设时薪 — 数字为他定制, 而非通用演示值。
        isDefault: profile?.hourly_rate == null,
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (err) {
    // safe to ignore: non-critical error, logged for observability
    logger.error('[Hourly Rate] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  // 🔧 架构优化: 用 zod 替代手写 validation
  const hourlyRateSchema = z.object({
    hourlyRate: z.number().finite().positive().max(1000000),
  });
  const body = await validateBody(request, hourlyRateSchema);
  if (isValidationError(body)) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const { hourlyRate } = body;

  try {
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ hourly_rate: hourlyRate, updated_at: now })
      .eq('id', user.id);

    if (updateError) {
      // 🔧 2026-07-15 (ARCH-5 #4 修复): DB 失败时返回 success: false (was success: true)
      //    旧代码: DB error 仍返回 success: true → 客户端以为时薪已更新, 实际没存
      //    → Freedom Translation 算式用旧值, 显示错误的自由月数
      //    修复: 返回 500, 客户端可重试
      logger.error('[Hourly Rate] Failed to update hourly_rate:', updateError.message);
      return NextResponse.json(
        { error: 'Failed to update hourly rate', success: false },
        { status: 500 }
      );
    }

    logger.info(`[Hourly Rate] Updated to $${hourlyRate}/hr for user ${user.id.substring(0, 8)}`);

    // 🔧 P1 fix: 同步时薪到 Letta Agent 的 human memory block (fire-and-forget)
    syncHourlyRateToAgent(user.id, hourlyRate).catch((err) => {
      logger.warn(`[Hourly Rate] Failed to sync to Letta agent for user ${user.id.substring(0, 8)}:`, err);
    });

    return NextResponse.json({ success: true, hourlyRate });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Hourly Rate] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
