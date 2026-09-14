/**
 * POST /api/buddy/daily-needs — 补充日常需求
 *
 * P1-5: 宠物陪伴感与个性成长系统
 *
 * Body: { needType: 'clarity' | 'connection', amount?: number }
 * 调用 replenish_daily_need RPC (SECURITY DEFINER, 原子操作 + clamp)
 *
 * 返回: { success: true, dailyNeeds: DailyNeeds }
 *
 * 🔧 PM-P2-7 fix (2026-07-17): 移除 'breath' (breath 属性已删除)
 *
 * 🔧 Round 104: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    without mergeCookies on 4 of 6 returns — auth cookie refresh was lost).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { NEED_REPLENISH_AMOUNT } from '@/lib/buddy-defaults';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const schema = z.object({
  needType: z.enum(['clarity', 'connection']),
  amount: z.number().int().positive().max(100).optional(),
});

export const POST = withAuth(async ({ request, user }) => {
  const bodyResult = await validateBody(request, schema);
  if (isValidationError(bodyResult)) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { needType, amount } = bodyResult;

  const replenishAmount = amount ?? NEED_REPLENISH_AMOUNT[needType as 'clarity' | 'connection'];

  const { supabase, error: adminError } = createAdminClient();
  if (adminError || !supabase) {
    logger.error('[Daily Needs] admin client error:', adminError);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const { data, error } = await supabase
    .rpc('replenish_daily_need', {
      p_user_id: user.id,
      p_need_type: needType,
      p_amount: replenishAmount,
    });

  if (error) {
    logger.error('[Daily Needs] RPC error:', error.message);
    return NextResponse.json({ error: 'Failed to replenish daily need' }, { status: 500 });
  }

  return NextResponse.json({ success: true, dailyNeeds: data });
});
