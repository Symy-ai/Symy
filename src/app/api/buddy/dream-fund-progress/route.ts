/**
 * POST /api/buddy/dream-fund-progress — 存入挑战节省的钱到 Dream Fund
 *
 * 🔧 Dream Fund 信任存入功能 (MVP)
 * Body: { fundId: 'auto' | string, amount: number, challengeId: string }
 *
 * 规则1: 金额必须等于挑战节省金额 (前端传, 后端不二次校验 — MVP)
 * 规则5: 重复存入防护 — challengeId 作为 dedup key
 *
 * 🔧 Round 103: Migrated to withAuth + Zod validation (was manual parsing
 *    without mergeCookies on 4 of 8 returns — auth cookie refresh was lost).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const schema = z.object({
  fundId: z.string().optional(),
  // 🔧 2026-07-15 (ARCH-5 #7): amount max $1M (was unbounded — could inflate total_saved)
  amount: z.number().positive().max(1_000_000),
  challengeId: z.string().min(1).max(200),
});

export const POST = withAuth(async ({ request, supabase, user }) => {
  const bodyResult = await validateBody(request, schema);
  if (isValidationError(bodyResult)) return NextResponse.json({ error: 'Invalid input: amount must be > 0, challengeId required' }, { status: 400 });
  const { fundId, amount, challengeId } = bodyResult;

  // 🔧 规则5: 重复存入防护 — 检查 health_events 是否已有此 challengeId 的 dream fund 进度
  // 🔧 ARCH fix (2026-07-22 P1 — TOCTOU race condition):
  //    旧代码: SELECT health_events (dedup check) → RPC → INSERT health_events
  //    Bug: 两个并发请求都通过 SELECT 检查, 都调 RPC → buddy_state/dream_fund 双倍累加
  //    修复: INSERT health_events FIRST (atomic dedup gate) → RPC → UPDATE health_events
  //    如果 INSERT 失败 (23505), 说明已存过, 返回 409
  //    如果 RPC 失败, DELETE health_events (best-effort rollback) → 用户可重试
  const { data: existingEvent } = await supabase
    .from('health_events')
    .select('id')
    .eq('user_id', user.id)
    .eq('event_type', 'challenge_reward')
    .contains('metadata', { challengeId })
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json(
      { error: 'This challenge has already been deposited', conflict: true },
      { status: 409 }
    );
  }

  // 🔧 Round 126: 从 dream_funds 表读 (不再从 buddy_state.dream_funds JSONB 读, 该列已删除)
  const { data: fundRows } = await supabase
    .from('dream_funds')
    .select('fund_id, current, target')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });

  const dreamFunds = (fundRows || []).map(r => ({
    id: r.fund_id,
    current: r.current,
    target: r.target,
  }));
  let targetFundId: string | null = null;

  if (fundId && fundId !== 'auto') {
    targetFundId = fundId;
  } else {
    // 找第一个未满的非 Savings 基金
    const incompleteFund = dreamFunds.find(f => f.id !== 'df-savings' && f.current < f.target);
    if (incompleteFund) {
      targetFundId = incompleteFund.id;
    } else {
      // 全满了 → 存入 Savings
      targetFundId = 'df-savings';
    }
  }

  // 用 admin client 调 applyBuddyStateDelta RPC (加 dream fund progress)
  const { supabase: adminSupabase } = createAdminClient();
  if (!adminSupabase) {
    return NextResponse.json({ error: 'Admin client unavailable' }, { status: 500 });
  }

  try {
    // 🔧 2026-07-15 (ARCH-10 P0-9 修复): 用正确的 apply_buddy_state_delta 参数名
    //    旧代码用了 complete_challenge_atomic 的参数名 (p_vitality_change, p_token_change,
    //    p_completed_trigger_id 等), 但调的是 apply_buddy_state_delta → endpoint 永远 500
    //    修复: 用 apply_buddy_state_delta 的正确参数名 (p_vitality_delta, p_token_delta, 等)

    // 🔧 ARCH fix (2026-07-22 P1 — TOCTOU race condition):
    //    INSERT health_events FIRST (atomic dedup gate) → RPC → UPDATE health_events
    //    trigger_id = `deposit:${challengeId}` 有 UNIQUE 约束 → 两个并发请求只有一个能 INSERT 成功
    const { error: insertError } = await adminSupabase
      .from('health_events')
      .insert({
        user_id: user.id,
        event_type: 'challenge_reward',
        vitality_change: 0,
        new_vitality: 0, // placeholder, will UPDATE after RPC
        token_change: 5,
        trigger_source: 'chat_mcp',
        trigger_id: `deposit:${challengeId}`,
        description: `Challenge savings deposited: $${amount.toFixed(2)}`,
        metadata: { challengeId, amount, fundId: targetFundId },
      })
      .select('id')
      .maybeSingle();

    if (insertError) {
      // dedup hit (23505) — another concurrent request already inserted
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'This challenge has already been deposited', conflict: true },
          { status: 409 }
        );
      }
      logger.error('[Dream Fund Progress] health_events INSERT (dedup gate) failed:', insertError.message);
      return NextResponse.json({ error: 'Failed to deposit' }, { status: 500 });
    }

    const { data, error } = await adminSupabase.rpc('apply_buddy_state_delta', {
      p_user_id: user.id,
      p_vitality_delta: 0,
      p_token_delta: 5,  // 🔧 规则6: 存入给 5 代币 (比不存入的 3 多)
      p_xp_delta: 0,
      p_challenges_delta: 0,
      p_total_saved_delta: amount,  // 存入金额累加到 total_saved
      p_add_badges: [],
      p_dream_fund_id: targetFundId,
      p_dream_fund_amount: amount,
      p_level_override: null,
      p_xp_to_next_override: null,
      p_xp_override: null,
    });

    if (error) {
      // RPC failed — best-effort DELETE the health_event so user can retry
      logger.error('[Dream Fund Progress] RPC error:', error.message);
      try {
        await adminSupabase
          .from('health_events')
          .delete()
          .eq('user_id', user.id)
          .eq('trigger_id', `deposit:${challengeId}`);
      } catch (delErr) {
        logger.error('[Dream Fund Progress] DELETE health_event (rollback) failed:', delErr);
      }
      return NextResponse.json({ error: 'Failed to deposit' }, { status: 500 });
    }

    // 🔧 2026-07-15: UPDATE health_events with RPC result (new_vitality)
    //    Fix overly optimistic cast — validate vitality is actually a number
    const rpcData = data as Record<string, unknown> | null;
    const rpcVitality = typeof rpcData?.vitality === 'number' ? rpcData.vitality : 0;
    const { error: eventUpdateError } = await adminSupabase
      .from('health_events')
      .update({ new_vitality: rpcVitality })
      .eq('user_id', user.id)
      .eq('trigger_id', `deposit:${challengeId}`);

    if (eventUpdateError) {
      // non-blocking — buddy_state 已更新, health_event 只是审计记录
      logger.warn('[Dream Fund Progress] health_events UPDATE (new_vitality) failed (non-blocking):', eventUpdateError.message);
    }

    return NextResponse.json({
      success: true,
      fundId: targetFundId,
      amount,
      ...data as Record<string, unknown>,
    });
      // safe to ignore: non-critical background operation, error already logged
  } catch (err) {
                  // safe to ignore: non-critical background operation, error already logged
    logger.error('[Dream Fund Progress] unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
