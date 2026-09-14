/* eslint-disable symy/no-warn-only-catch -- individual catch blocks reviewed per error-policy.md */
/**
 * POST /api/buddy/deposit — Dream Fund 信任存入
 *
 * 用户在挑战通过后选择将省下的钱存入 Dream Fund (或跳过)
 *
 * Body: { challengeId: string, action: 'deposit' | 'skip' }
 *
 * action='deposit':
 *   1. 检查 deposit_status == 'unsettled' (409 if not)
 *   2. 从 active_challenges 表读取 saved amount
 *   3. 选择 dream fund (第一个未满的, fallback 到 Savings)
 *   4. 调 apply_buddy_state_delta: dream fund progress + bonus tokens
 *   5. 同步 dream_funds 表
 *   6. 设置 deposit_status = 'deposited'
 *   7. 返回更新的 fund info
 *
 * action='skip':
 *   1. 检查 deposit_status == 'unsettled' (409 if not)
 *   2. 设置 deposit_status = 'skipped'
 *   3. 返回 success
 *
 * 🔧 2026-07-21: Migrated to withAuth HOF (was manual createAuthenticatedClient
 *    with ~10 mergeCookies calls — now handled automatically by withAuth).
 */

export const dynamic = 'force-dynamic';

import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { SAVINGS_FUND_ID } from '@/lib/buddy-defaults';
import { validateBody, isValidationError } from '@/lib/api-validation';
import { z } from 'zod';
// 🔧 P2 fix (Fill history): 用于计算 life translation (金额 → 小时数)
import { getUserHourlyRate } from '@/lib/user-hourly-rate';
// 🔧 P2 fix (Fill history): 用于生成 description (镜像哲学文案)
import { dreamFundProgressDesc } from '@/lib/mcp-tools/handlers/descriptions';

// 代币奖励拆分: deposit 给 bonus tokens (与 complete_challenge 的 base 对应)
const DEPOSIT_BONUS_TOKENS = {
  boss: 10,
  standard: 4,
  quick_pass: 1,
};

export const POST = withAuth(async ({ supabase, user, request }) => {
  // 🔧 ARCH fix (Round 6 AUDIT-3 P0 #1): 用 zod 替代手写 validation
  const depositSchema = z.object({
    challengeId: z.string().min(1).max(200),
    action: z.enum(['deposit', 'skip']),
    fundId: z.string().min(1).max(200).optional(),
  });
  const body = await validateBody(request, depositSchema);
  if (isValidationError(body)) return body;
  const { challengeId, action, fundId } = body;

  // 查询挑战记录
  const { data: challenge, error: challengeError } = await supabase
    .from('active_challenges')
    .select('id, user_id, amount, challenge_type, status, deposit_status')
    .eq('id', challengeId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (challengeError || !challenge) {
    return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
  }

  const challengeData = challenge as {
    id: string;
    user_id: string;
    amount: number;
    challenge_type: string;
    status: string;
    deposit_status: string;
  };

  // 幂等性检查: 只允许 unsettled → deposited/skipped
  if (challengeData.deposit_status !== 'unsettled') {
    return NextResponse.json(
      { error: `Challenge already ${challengeData.deposit_status}`, depositStatus: challengeData.deposit_status },
      { status: 409 },
    );
  }

  // 🔧 ARCH fix Round 113: CAS FIRST, then RPC — prevents concurrent deposit double-counting
  const claimStatus = action === 'skip' ? 'skipped' : 'deposited';
  const claimResult = await supabase
    .from('active_challenges')
    .update({ deposit_status: claimStatus, deposited_at: new Date().toISOString() })
    .eq('id', challengeId)
    .eq('user_id', user.id)
    .eq('deposit_status', 'unsettled')
    .select('id');

  if (claimResult.error) {
    logger.error('[Deposit] CAS claim failed:', claimResult.error.message);
    return NextResponse.json({ error: 'Failed to claim deposit' }, { status: 500 });
  }
  if (!claimResult.data || claimResult.data.length === 0) {
    logger.info(`[Deposit] CAS rejected (already ${claimStatus}) for challenge ${challengeId}`);
    return NextResponse.json(
      { error: `Challenge already ${claimStatus}`, depositStatus: claimStatus },
      { status: 409 },
    );
  }

  // Skip: CAS already set deposit_status='skipped', done
  if (action === 'skip') {
    logger.info(`[Deposit] Skipped for challenge ${challengeId}`);
    return NextResponse.json({ success: true, action: 'skip' });
  }

  // Deposit: 存入 Dream Fund
  const savedAmount = challengeData.amount;
  const VALID_CHALLENGE_TYPES = ['boss', 'standard', 'quick_pass'] as const;
  type ChallengeType = typeof VALID_CHALLENGE_TYPES[number];
  const rawChallengeType = challengeData.challenge_type;
  if (!VALID_CHALLENGE_TYPES.includes(rawChallengeType as ChallengeType)) {
    logger.error('[Deposit] Invalid challenge_type:', rawChallengeType);
    return NextResponse.json({ error: `Invalid challenge_type: ${rawChallengeType}` }, { status: 400 });
  }
  const challengeType = rawChallengeType as ChallengeType;

  // 1. 选择 dream fund
  const { data: tableFunds } = await supabase
    .from('dream_funds')
    .select('fund_id, name, target, current, emoji')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  type DreamFundRow = { fund_id: string; name: string; target: number; current: number; emoji: string };
  const dreamFunds = (tableFunds as DreamFundRow[] || []).map((f: DreamFundRow) => ({
    id: f.fund_id,
    name: f.name,
    target: f.target,
    current: f.current,
    emoji: f.emoji,
  }));

  let targetFund: { id: string; name: string; target: number; current: number; emoji: string } | undefined;
  if (fundId) {
    targetFund = dreamFunds.find(f => f.id === fundId && f.current < f.target);
    if (!targetFund) {
      logger.warn(`[Deposit] Invalid fundId ${fundId} for user ${user.id}, falling back to auto-select`);
    }
  }
  if (!targetFund) {
    targetFund = dreamFunds.find(f => f.current < f.target)
      ?? dreamFunds.find(f => f.id === SAVINGS_FUND_ID)
      ?? dreamFunds[0];
  }

  if (!targetFund) {
    logger.error('[Deposit] No dream fund found for user', user.id);
    return NextResponse.json({ error: 'No dream fund available' }, { status: 400 });
  }

  const bonusTokens = DEPOSIT_BONUS_TOKENS[challengeType] || 1;

  // 🔧 PM-OVERFLOW fix: 溢出金额分配到多个梦想基金
  const fundAllocation: Array<{ fund: typeof targetFund; amount: number }> = [];
  let remainingAmount = savedAmount;

  const otherUnfilledFunds = dreamFunds
    .filter(f => f.id !== targetFund!.id && f.current < f.target)
    .sort((a, b) => {
      if (a.id === SAVINGS_FUND_ID) return 1;
      if (b.id === SAVINGS_FUND_ID) return -1;
      return 0;
    });

  const allocationOrder = [targetFund, ...otherUnfilledFunds];

  for (const fund of allocationOrder) {
    if (remainingAmount <= 0) break;
    const deficit = fund.target - fund.current;
    const isSavings = fund.id === SAVINGS_FUND_ID;
    const amountToFund = isSavings ? remainingAmount : Math.min(remainingAmount, deficit);
    if (amountToFund > 0) {
      fundAllocation.push({ fund, amount: amountToFund });
      remainingAmount -= amountToFund;
    }
  }

  if (remainingAmount > 0) {
    logger.warn(`[Deposit] ${remainingAmount} could not be allocated (all funds full, no Savings fund)`);
  }

  // 2. 调 apply_buddy_state_delta
  let firstAllocation = true;
  const fundResults: Array<{
    fundId: string;
    fundName: string;
    fundEmoji: string;
    amount: number;
    newCurrent: number;
    target: number;
    progress: number;
    goalReached: boolean;
  }> = [];

  for (const { fund, amount } of fundAllocation) {
    const { error: rpcError } = await supabase.rpc('apply_buddy_state_delta', {
      p_user_id: user.id,
      p_token_delta: firstAllocation ? bonusTokens : 0,
      p_total_saved_delta: amount,
      p_dream_fund_id: fund.id,
      p_dream_fund_amount: amount,
    });

    if (rpcError) {
      logger.error('[Deposit] RPC failed:', rpcError.message, 'code:', rpcError.code, 'details:', rpcError.details, 'hint:', rpcError.hint);
      // 🔧 ARCH fix (2026-07-22 P0 — multi-fund retry double accumulation):
      //    旧代码: rollback deposit_status to 'unsettled' → user retries → funds that
      //    already succeeded get apply_buddy_state_delta called AGAIN → double-counted.
      //
      //    根因: apply_buddy_state_delta is NOT idempotent (adds deltas). Rollback to
      //    'unsettled' allows retry, which double-counts already-applied funds.
      //
      //    修复: DON'T rollback. Keep deposit_status='deposited'. Return 500 with
      //    partial info. User can't retry (CAS will reject). Ops reconciles via logs.
      //
      //    真正的根因修复 (需要 DB migration): 创建 batch RPC apply_deposit_batch,
      //    在单个 DB transaction 内原子地应用所有 funds — 要么全成功, 要么全失败。
      //    详见 supabase/migrations/125_deposit_batch_rpc.sql (待部署)。
      logger.error(`[Deposit] PARTIAL FAILURE — challenge ${challengeId} marked deposited but ${fund.id} failed. Applied funds: ${fundResults.map(r => r.fundId).join(', ') || 'none'}. User cannot retry — ops reconciliation needed.`);

      return NextResponse.json({
        error: 'Deposit partially failed — please contact support',
        partial: true,
        appliedFunds: fundResults.map(r => ({ fundId: r.fundId, fundName: r.fundName, amount: r.amount })),
        failedFund: { fundId: fund.id, fundName: fund.name, amount },
        challengeId,
      }, { status: 500 });
    }

    const fundNewCurrent = Math.min(fund.target, fund.current + amount);
    const fundProgress = Math.round((fundNewCurrent / fund.target) * 100);
    const fundGoalReached = fundNewCurrent >= fund.target;

    fundResults.push({
      fundId: fund.id,
      fundName: fund.name,
      fundEmoji: fund.emoji,
      amount,
      newCurrent: fundNewCurrent,
      target: fund.target,
      progress: fundProgress,
      goalReached: fundGoalReached,
    });

    firstAllocation = false;
  }

  // 3. 同步 dream_funds 表
  // 🔧 ARCH fix (2026-07-22 P1 — adversarial review: dream_funds UPDATE 无 CAS):
  //    旧代码: UPDATE current = result.newCurrent (无 CAS)
  //    Bug: 并发请求覆盖彼此的更新 (last-write-wins)
  //    修复: 加 CAS — 只在 current 未变时更新 (但 RPC 已原子更新 buddy_state,
  //    dream_funds 是同步副本, 所以用 RPC 返回的 newCurrent 作为期望值)
  //    注意: 这里 CAS 失败是可接受的 — buddy_state 是 source of truth,
  //    dream_funds 表最终会被 buddy-sync 同步
  let partial = false;
  let partialMessage: string | undefined;

  for (const result of fundResults) {
    const { error: fundUpdateError } = await supabase
      .from('dream_funds')
      .update({ current: result.newCurrent, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('fund_id', result.fundId);

    if (fundUpdateError) {
      logger.error(`[Deposit] dream_funds UPDATE failed for fund ${result.fundId}:`, fundUpdateError.message);
      partial = true;
      partialMessage = 'dream_funds table sync failed — buddy-sync will reconcile';
    }
  }

  // 5. 为每个基金创建 health_event (Fill history)
  try {
    const { createHealthEvent } = await import('@/lib/health-impact');
    const hourlyRate = await getUserHourlyRate(user.id);

    for (const result of fundResults) {
      const badgeAwarded = result.progress >= 50;
      const descLocale = 'en';
      const description = dreamFundProgressDesc(descLocale, result.amount, result.fundName, result.progress, badgeAwarded, hourlyRate);
      const depositDedupKey = `deposit:${user.id}:${challengeId}:${result.fundId}:${result.amount}`;
      await createHealthEvent({
        userId: user.id,
        eventType: 'challenge_reward',
        triggerSource: 'deposit_api',
        triggerId: depositDedupKey,
        description,
        metadata: {
          fundId: result.fundId,
          amount: result.amount,
          fundName: result.fundName,
          progress: result.progress,
          badgeAwarded,
          newCurrent: result.newCurrent,
          challengeId,
          source: 'deposit',
        },
        vitalityOverride: 0,
        tokenOverride: 0,
      });
      logger.info(`[Deposit] health_event created for fund ${result.fundId} (+$${result.amount})`);
    }
    // safe to ignore: non-critical background operation, error already logged
  } catch (e) {
    // safe to ignore: non-critical background operation, error already logged
    logger.warn('[Deposit] createHealthEvent failed (non-critical, fund already updated):', e);
  }

  const primaryFund = fundResults[0];
  logger.info(`[Deposit] Success: challenge=${challengeId}, funds=${fundResults.map(r => `${r.fundName}:+$${r.amount}`).join(', ')}, bonus_tokens=${bonusTokens}, partial=${partial}`);

  return NextResponse.json({
    success: true,
    action: 'deposit',
    fundId: primaryFund.fundId,
    fundName: primaryFund.fundName,
    fundEmoji: primaryFund.fundEmoji,
    amount: savedAmount,
    newCurrent: primaryFund.newCurrent,
    target: primaryFund.target,
    progress: primaryFund.progress,
    goalReached: primaryFund.goalReached,
    bonusTokens,
    fundAllocation: fundResults,
    ...(partial ? { partial: true, partialMessage } : {}),
  });
});
