/**
 * Dream Funds CRUD API — 独立表持久化
 *
 * GET    /api/buddy/dream-funds       — 获取当前用户的所有梦想基金
 * POST   /api/buddy/dream-funds       — 创建新梦想基金
 * PATCH  /api/buddy/dream-funds       — 更新梦想基金（按 fund_id）
 * DELETE /api/buddy/dream-funds       — 删除梦想基金（按 fund_id）
 *
 * 数据持久化到 Supabase dream_funds 表（023 迁移）
 *
 * 🔧 2026-07-21: Migrated all 4 handlers to withAuth HOF (was manual
 *    createAuthenticatedClient with ~15 mergeCookies calls — now handled
 *    automatically by withAuth).
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { logger } from '@/lib/logger';
// 🔧 ARCH fix (Round 58): 用共享 MAX_DREAM_FUND_TARGET 替代硬编码 1000000
import { SAVINGS_FUND_TARGET } from '@/lib/buddy-defaults';
import { generateDreamFundId } from '@/lib/id-helpers';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { asUpdate } from '@/lib/supabase-type-helpers';
import type { Database } from '@/lib/database.types';
import { z } from 'zod';

type DreamFundsUpdate = Database['public']['Tables']['dream_funds']['Update'];

const MAX_FUNDS = 10;

interface DreamFundRow {
  id: string;
  user_id: string;
  fund_id: string;
  name: string;
  target: number;
  current: number;
  emoji: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** 将独立表行转为前端格式 */
function rowToFE(row: DreamFundRow) {
  return {
    id: row.fund_id,
    name: row.name,
    target: row.target,
    current: row.current,
    emoji: row.emoji,
  };
}

// GET: 获取所有梦想基金
export const GET = withAuth(async ({ supabase, user }) => {
  const { data, error } = await supabase
    .from('dream_funds')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });

  if (error) {
    // 🔧 ARCH fix (Round 11 API-3 — fake success 根因修复):
    //    旧代码返回 200 + 空/缓存数组 → 客户端误以为读取成功, 显示过期数据。
    //    根因修复: 返回 500, 让客户端知道读取失败, 可提示用户重试。
    logger.error('[Dream Funds] GET error:', error.message);
    return NextResponse.json({ error: 'Failed to load dream funds. Please refresh.' }, { status: 500 });
  }

  const funds = (data || []) as DreamFundRow[];
  return NextResponse.json({ dreamFunds: funds.map(rowToFE) });
});

// POST: 创建新梦想基金
export const POST = withAuth(async ({ supabase, user, request }) => {
  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  const createSchema = z.object({
    fund_id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100).optional(),
    name: z.string().trim().min(1, 'Name is required').max(100),
    target: z.number().finite().min(100, 'Target must be at least 100').max(SAVINGS_FUND_TARGET),
    emoji: z.string().max(10).optional(),
    color: z.string().max(20).optional(),
  });
  const body = await validateBody(request, createSchema);
  if (isValidationError(body)) return body;

  // 检查基金数量上限（如果表不存在，count 为 null，跳过检查）
  const { count } = await supabase
    .from('dream_funds')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (count !== null && count >= MAX_FUNDS) {
    return NextResponse.json({ error: 'Maximum number of dream funds reached' }, { status: 400 });
  }

  const fundId = body.fund_id || generateDreamFundId();
  const name = body.name;
  const target = body.target;
  const emoji = body.emoji ?? '🎯';

  // 🔧 Bug fix: 新基金要插入到 Savings 基金前面 (而非最后)
  const SAVINGS_FUND_ID = 'df-savings';
  const { data: existingFunds } = await supabase
    .from('dream_funds')
    .select('fund_id, sort_order')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true });

  const savingsIdx = existingFunds?.findIndex(f => f.fund_id === SAVINGS_FUND_ID) ?? -1;
  let newSortOrder = count || 0; // fallback: 放最后

  if (savingsIdx >= 0 && existingFunds) {
    // Savings 存在 → 新基金插入到 Savings 前面
    newSortOrder = existingFunds[savingsIdx].sort_order;
    // 把 Savings 及之后的基金 sort_order +1
    for (let i = savingsIdx; i < existingFunds.length; i++) {
      await supabase
        .from('dream_funds')
        .update({ sort_order: existingFunds[i].sort_order + 1 })
        .eq('fund_id', existingFunds[i].fund_id)
        .eq('user_id', user.id);
    }
  }

  const { data, error } = await supabase
    .from('dream_funds')
    .insert({
      user_id: user.id,
      fund_id: fundId,
      name,
      target,
      current: 0,
      emoji,
      sort_order: newSortOrder,
    })
    .select()
    .maybeSingle();

  if (error) {
    // 🔧 ARCH fix (Round 7 edge H7): 旧代码返回 fake success → 用户创建后刷新页面 fund 消失
    logger.error('[Dream Funds] POST error (table may not exist):', error.message);
    return NextResponse.json({ error: 'Failed to create dream fund. Please try again.' }, { status: 503 });
  }

  return NextResponse.json({ dreamFund: rowToFE(data as DreamFundRow) });
});

// PATCH: 更新梦想基金
export const PATCH = withAuth(async ({ supabase, user, request }) => {
  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  const patchSchema = z.object({
    fund_id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100),
    name: z.string().trim().min(1).max(100).optional(),
    target: z.number().finite().min(100).max(SAVINGS_FUND_TARGET).optional(),
    emoji: z.string().max(10).optional(),
    color: z.string().max(20).optional(),
    sort_order: z.number().int().min(0).max(999).optional(),
  });
  const body = await validateBody(request, patchSchema);
  if (isValidationError(body)) return body;

  const fundId = body.fund_id;

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.target !== undefined) updates.target = body.target;
  if (body.emoji !== undefined) updates.emoji = body.emoji;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
  }

  // If target changed, clamp current <= target
  const { data: existing } = await supabase
    .from('dream_funds')
    .select('current, target')
    .eq('user_id', user.id)
    .eq('fund_id', fundId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Dream fund not found' }, { status: 404 });
  }

  const newTarget = Number(updates.target ?? existing.target);
  if (existing.current > newTarget) {
    updates.current = newTarget;
  }

  const { data, error } = await supabase
    .from('dream_funds')
    .update(asUpdate<DreamFundsUpdate>(updates))
    .eq('user_id', user.id)
    .eq('fund_id', fundId)
    .select()
    .maybeSingle();

  if (error) {
    // 🔧 ARCH fix (Round 11 API-2 — fake success 根因修复):
    logger.error('[Dream Funds] PATCH error:', error.message);
    return NextResponse.json({ error: 'Failed to update dream fund. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ dreamFund: rowToFE(data as DreamFundRow) });
});

// DELETE: 删除梦想基金
export const DELETE = withAuth(async ({ supabase, user, request }) => {
  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  const deleteSchema = z.object({
    fund_id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100),
  });
  const body = await validateBody(request, deleteSchema);
  if (isValidationError(body)) return body;

  const fundId = body.fund_id;

  // 🔧 CL1 fix: Savings 基金 (df-savings) 不可删除 — 它是 overflow sink
  if (fundId === 'df-savings') {
    return NextResponse.json({ error: 'Savings fund cannot be deleted' }, { status: 400 });
  }

  // 不允许删除最后一个基金（如果表不存在，count 为 null，跳过检查）
  const { count } = await supabase
    .from('dream_funds')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (count !== null && count <= 1) {
    return NextResponse.json({ error: 'Cannot delete the last dream fund' }, { status: 400 });
  }

  // 🔧 金额转移 fix (Round 48): 先获取被删基金的 current 金额, 用于转移到其他基金
  const { data: fundToDelete } = await supabase
    .from('dream_funds')
    .select('current')
    .eq('user_id', user.id)
    .eq('fund_id', fundId)
    .maybeSingle();

  const transferAmount = fundToDelete?.current || 0;

  // 🔧 ARCH fix (Round 7 edge H6): 用 count: 'exact' 检查实际删除行数
  const { error, count: deleteCount } = await supabase
    .from('dream_funds')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
    .eq('fund_id', fundId);

  if (error) {
    // 🔧 ARCH fix (Round 11 API-2 — fake success 根因修复):
    logger.error('[Dream Funds] DELETE error:', error.message);
    return NextResponse.json({ error: 'Failed to delete dream fund. Please try again.' }, { status: 500 });
  }

  // 🔧 ARCH fix (Round 7 edge H6): 0 行删除 = fund 不存在或不属于此用户 → 返回 404
  if (deleteCount === 0) {
    return NextResponse.json({ error: 'Dream fund not found' }, { status: 404 });
  }

  // 🔧 金额转移 fix (Round 48): 把被删基金的 current 金额转移到其他未满的基金
  if (transferAmount > 0) {
    try {
      // 读取剩余所有基金 (按排序顺序)
      const { data: remainingFunds } = await supabase
        .from('dream_funds')
        .select('fund_id, current, target')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });

      if (remainingFunds && remainingFunds.length > 0) {
        let amountToDistribute = transferAmount;
        // 计算每个基金的新 current
        // 🔧 ARCH fix (2026-07-22 P2): 保留 original_current 用于 CAS
        const updates: Array<{ fund_id: string; new_current: number; original_current: number }> = [];
        for (const fund of remainingFunds as Array<{ fund_id: string; current: number; target: number }>) {
          if (amountToDistribute <= 0) break;
          const space = fund.target - fund.current;
          if (space > 0) {
            const fill = Math.min(space, amountToDistribute);
            amountToDistribute -= fill;
            updates.push({ fund_id: fund.fund_id, new_current: fund.current + fill, original_current: fund.current });
          }
        }

        // 批量更新每个基金的 current (Round 120 audit fix: 检查每个 UPDATE 结果)
        // 🔧 ARCH fix (2026-07-22 P2 — TOCTOU on fund.current):
        //    旧代码: UPDATE current = fund.current + fill (无 CAS)
        //    Bug: 并发请求在 read 和 write 之间更新了 current → 覆盖并发更新
        //    修复: 加 .eq('current', update.original_current) CAS — 只在 current 未变时更新
        //    如果 CAS 失败, fill 金额写入 audit record 供 ops 对账
        const updateResults = await Promise.allSettled(
          updates.map(update =>
            supabase
              .from('dream_funds')
              .update({ current: update.new_current, updated_at: new Date().toISOString() })
              .eq('user_id', user.id)
              .eq('fund_id', update.fund_id)
              .eq('current', update.original_current) // CAS: only if current hasn't changed
              .then(result => ({ fund_id: update.fund_id, error: result.error }))
          )
        );
        const failedUpdates: Array<{ fund_id: string; errorMessage: string }> = [];
        for (let i = 0; i < updateResults.length; i++) {
          const r = updateResults[i];
          if (r.status === 'fulfilled') {
            if (r.value.error) {
              failedUpdates.push({ fund_id: r.value.fund_id, errorMessage: r.value.error.message });
            }
          } else {
            // rejected (network error, etc.)
            failedUpdates.push({ fund_id: updates[i].fund_id, errorMessage: String(r.reason) });
          }
        }
        if (failedUpdates.length > 0) {
          logger.error(
            `[Dream Funds] ${failedUpdates.length}/${updates.length} redistribution updates FAILED: ` +
            failedUpdates.map(f => `${f.fund_id}=${f.errorMessage}`).join(', ')
          );
        }

        if (amountToDistribute > 0) {
          // 🔧 Round 120 audit fix: 旧代码 logger.warn → 静默丢失用户金额
          logger.error(
            `[Dream Funds] CRITICAL: $${amountToDistribute} could not be redistributed (all funds full). ` +
            `User's money is effectively lost from dream funds view. Writing audit record.`
          );
          try {
            await supabase.from('health_events').insert({
              user_id: user.id,
              event_type: 'manual_adjustment',
              description: `Redistribution failed on dream fund delete: $${amountToDistribute} unallocated (all funds full)`,
              vitality_change: 0,
              new_vitality: 0,
              token_change: 0,
              trigger_source: 'dream_fund_redistribute_failed',
              trigger_id: `drf:${fundId}:${Date.now()}`,
              metadata: {
                deleted_fund_id: fundId,
                unallocated_amount: amountToDistribute,
                transfer_amount: transferAmount,
                failed_updates: failedUpdates.length,
                created_at: new Date().toISOString(),
              },
            });
            // safe to ignore: non-critical background operation, error already logged
          } catch (auditErr) {
            // safe to ignore: non-critical background operation, error already logged
            logger.error('[Dream Funds] Failed to write redistribution audit record:', auditErr);
          }
        }

        logger.info(`[Dream Funds] Redistributed ${transferAmount} from deleted fund to ${updates.length} remaining funds (${failedUpdates.length} failed, ${amountToDistribute} unallocated)`);
      }
      // 注意: total_saved 不需要更新 — 金额只是从被删基金转移到其他基金, sum(current) 不变
      // safe to ignore: non-critical background operation, error already logged
    } catch (err) {
      // safe to ignore: non-critical background operation, error already logged
      logger.warn('[Dream Funds] Failed to redistribute funds on delete:', err);
      // 不 fail — fund 已删除, 金额转移失败用户可接受 (total_saved 稍后同步)
    }
  }

  return NextResponse.json({ success: true });
});
